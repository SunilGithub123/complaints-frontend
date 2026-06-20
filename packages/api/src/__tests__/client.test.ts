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
      baseUrl: '/api/v1',
      getAccessToken: () => 'access-123',
    });

    const result = await customFetch<{ data: { success: boolean; data: { id: number } } }>(
      '/staff/me',
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
      baseUrl: '/api/v1',
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
      '/staff/me',
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
});

