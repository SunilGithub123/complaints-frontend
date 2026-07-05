import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetAuthHooksForTests, customFetch, setAuthHooks } from '../client';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  __resetAuthHooksForTests();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('customFetch', () => {
  it('attaches Bearer token from getAccessToken() and parses JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, data: { id: 7 } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    setAuthHooks({
      baseUrl: '',
      getAccessToken: () => 'access-123',
    });

    const result = await customFetch<{ data: { success: boolean; data: { id: number } } }>(
      '/api/v1/staff/me',
      { method: 'GET' },
    );

    expect(result.data).toEqual({ success: true, data: { id: 7 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/staff/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-123');
  });

  it('on 401: refreshes once and retries the original request with the new token', async () => {
    const onTokensRefreshed = vi.fn();
    setAuthHooks({
      baseUrl: '',
      getAccessToken: () => 'stale-token',
      getRefreshToken: () => 'refresh-abc',
      onTokensRefreshed,
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'AUTH_EXPIRED', message: 'expired' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            accessToken: 'fresh-token',
            refreshToken: 'refresh-xyz',
            accessTokenExpiresAt: '2026-06-20T10:00:00Z',
            refreshTokenExpiresAt: '2026-06-27T10:00:00Z',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7 } }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await customFetch<{ data: { success: boolean; data: { id: number } } }>(
      '/api/v1/staff/me',
      { method: 'GET' },
    );

    expect(result.data).toEqual({ success: true, data: { id: 7 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const [retryUrl, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];

    expect(firstUrl).toBe('/api/v1/staff/me');
    expect((firstInit.headers as Record<string, string>).Authorization).toBe('Bearer stale-token');

    expect(refreshUrl).toBe('/api/v1/staff/auth/refresh');
    expect(refreshInit.method).toBe('POST');
    expect(JSON.parse(refreshInit.body as string)).toEqual({ refreshToken: 'refresh-abc' });

    expect(retryUrl).toBe('/api/v1/staff/me');
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');

    expect(onTokensRefreshed).toHaveBeenCalledTimes(1);
    expect(onTokensRefreshed).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'fresh-token', refreshToken: 'refresh-xyz' }),
    );
  });

  it('on consumer 401: dispatches onConsumerUnauthenticated (no refresh) and throws', async () => {
    const onConsumerUnauthenticated = vi.fn();
    const onUnauthenticated = vi.fn();
    setAuthHooks({
      baseUrl: '',
      getConsumerToken: () => 'consumer-jwt-abc',
      // These are staff-only hooks; wire them to prove we do NOT walk
      // the refresh path when a `/consumer/**` URL returns 401.
      getRefreshToken: () => 'staff-refresh-should-not-fire',
      onConsumerUnauthenticated,
      onUnauthenticated,
    });

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'AUTH_EXPIRED', message: 'expired' } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      customFetch('/api/v1/consumer/complaints', { method: 'POST' }),
    ).rejects.toMatchObject({ status: 401, code: 'AUTH_EXPIRED' });

    // Exactly one call — no refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onConsumerUnauthenticated).toHaveBeenCalledTimes(1);
    // Staff logout hook stays untouched — the two auth surfaces are independent.
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('does NOT dispatch onConsumerUnauthenticated for anonymous /auth/consumer/** 401s', async () => {
    // The OTP send/verify endpoints are anonymous (no Bearer sent); a
    // 401 there is a business error surface (rate-limit / stale OTP),
    // not a session-expiry. Mapping it to a logout would nuke the
    // identity the consumer just typed.
    const onConsumerUnauthenticated = vi.fn();
    setAuthHooks({ baseUrl: '', onConsumerUnauthenticated });

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'OTP_STALE', message: 'stale' } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      customFetch('/api/v1/auth/consumer/verify', { method: 'POST' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(onConsumerUnauthenticated).not.toHaveBeenCalled();
  });
});

