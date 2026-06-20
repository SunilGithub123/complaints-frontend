/**
 * Tiny `fetch`-based transport that the orval-generated TanStack Query hooks
 * call into (wired via `output.override.mutator` in `orval.config.ts`).
 *
 * Design rules (see ../../../.github/copilot-instructions.md):
 *   - Framework-free: no React imports, runnable from Node (for Vitest).
 *   - Pluggable: the package does NOT read `import.meta.env.*` or import any
 *     auth store. The host app injects token getters at boot via
 *     {@link setAuthHooks}.
 *   - Single error contract: every non-2xx response is rethrown as an
 *     {@link ApiError} carrying the backend `ApiResponse.error` envelope.
 *   - Refresh-once-on-401, single in-flight (no thundering herd).
 *
 * Base URL: the host app may override the default `/api/v1` by injecting a
 * value via {@link setAuthHooks} (`baseUrl` field). Keeping env reads out of
 * this package is deliberate — same code runs in `apps/web` and (later)
 * `apps/mobile` without conditional imports.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  status: number;
  traceId?: string;
  fieldErrors?: Record<string, string>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId?: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(body: ApiErrorBody) {
    super(body.message || body.code || `HTTP ${body.status}`);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = body.status;
    this.traceId = body.traceId;
    this.fieldErrors = body.fieldErrors;
  }
}

export interface AuthHooks {
  /** Returns the current access JWT, or `null` if anonymous. */
  getAccessToken?: () => string | null;
  /** Returns the current refresh token, or `null` if none. */
  getRefreshToken?: () => string | null;
  /**
   * Called when refresh fails (or no refresh token is present) on a 401.
   * The host app should clear its auth state and route to login.
   */
  onUnauthenticated?: () => void;
  /**
   * Called after a successful refresh so the host app can persist the new
   * access + refresh pair (matches `LoginResponse` shape from the backend).
   */
  onTokensRefreshed?: (tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt?: string;
    refreshTokenExpiresAt?: string;
  }) => void;
  /** Override the default `/api/v1` base URL (e.g. from `VITE_API_BASE_URL`). */
  baseUrl?: string;
}

let authHooks: AuthHooks = {};

export function setAuthHooks(hooks: AuthHooks): void {
  authHooks = { ...authHooks, ...hooks };
}

/** Exposed for tests only. */
export function __resetAuthHooksForTests(): void {
  authHooks = {};
  inFlightRefresh = null;
}

const DEFAULT_BASE_URL = '/api/v1';
const REFRESH_PATH = '/staff/auth/refresh';

let inFlightRefresh: Promise<string | null> | null = null;

function getBaseUrl(): string {
  return authHooks.baseUrl ?? DEFAULT_BASE_URL;
}

function joinUrl(base: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const u = url.startsWith('/') ? url : `/${url}`;
  return `${b}${u}`;
}

function dispatchLogout(): void {
  try {
    authHooks.onUnauthenticated?.();
  } finally {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('auth:logout'));
    }
  }
}

/**
 * Fire a single refresh request; coalesce concurrent callers onto the same
 * in-flight promise. Returns the new access token on success, `null` on
 * failure (after dispatching `auth:logout`).
 */
async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  const refreshToken = authHooks.getRefreshToken?.() ?? null;
  if (!refreshToken) {
    dispatchLogout();
    return null;
  }

  inFlightRefresh = (async () => {
    try {
      const res = await fetch(joinUrl(getBaseUrl(), REFRESH_PATH), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        dispatchLogout();
        return null;
      }
      const envelope = (await res.json()) as {
        success?: boolean;
        data?: {
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresAt?: string;
          refreshTokenExpiresAt?: string;
        };
      };
      const data = envelope?.data;
      if (!data?.accessToken || !data?.refreshToken) {
        dispatchLogout();
        return null;
      }
      authHooks.onTokensRefreshed?.(data);
      return data.accessToken;
    } catch {
      dispatchLogout();
      return null;
    } finally {
      // Cleared on next tick so coalesced callers see the same resolved value.
      queueMicrotask(() => {
        inFlightRefresh = null;
      });
    }
  })();

  return inFlightRefresh;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  const ct = res.headers.get('content-type') ?? '';
  try {
    body = ct.includes('application/json') ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  // Backend envelope: { success, data, error: { code, message, details }, timestamp }
  const envelope = body as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | null;
  const err = envelope?.error;
  const fieldErrors: Record<string, string> | undefined =
    err?.details && typeof err.details === 'object'
      ? Object.fromEntries(
          Object.entries(err.details).map(([k, v]) => [k, String(v)]),
        )
      : undefined;
  return new ApiError({
    code: err?.code ?? `HTTP_${res.status}`,
    message: err?.message ?? res.statusText ?? `HTTP ${res.status}`,
    status: res.status,
    ...(fieldErrors !== undefined && { fieldErrors }),
    ...(res.headers.get('x-trace-id')
      ? { traceId: res.headers.get('x-trace-id') as string }
      : {}),
  });
}

export interface CustomFetchInit extends RequestInit {
  /** Optional response type hint. orval emits JSON by default. */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
}

async function doFetch<T>(
  url: string,
  init: CustomFetchInit,
  accessToken: string | null,
): Promise<T> {
  const { responseType, headers, ...rest } = init;
  const fullUrl = joinUrl(getBaseUrl(), url);

  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };
  if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(fullUrl, { ...rest, headers: finalHeaders });
  if (!res.ok) {
    if (res.status === 401 && !url.endsWith(REFRESH_PATH)) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return doFetch<T>(url, init, newToken);
      }
    }
    throw await parseError(res);
  }

  if (responseType === 'text') return (await res.text()) as unknown as T;
  if (responseType === 'blob') return (await res.blob()) as unknown as T;
  if (responseType === 'arrayBuffer') return (await res.arrayBuffer()) as unknown as T;
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return (await res.text()) as unknown as T;

  // orval (httpClient: 'fetch') expects `{ status, data, headers }`-shaped
  // responses for its generated `<Op>Response*` discriminated unions. Return
  // both the parsed body and a small envelope so generated code compiles.
  const data = await res.json();
  return {
    status: res.status,
    data,
    headers: res.headers,
  } as unknown as T;
}

/**
 * The mutator orval calls. Signature matches orval's `httpClient: 'fetch'`
 * convention: `(url: string, init?: RequestInit) => Promise<T>`.
 * Generated code imports it by name — keep this stable.
 */
export function customFetch<T>(url: string, init: CustomFetchInit = {}): Promise<T> {
  const accessToken = authHooks.getAccessToken?.() ?? null;
  return doFetch<T>(url, init, accessToken);
}

export default customFetch;

