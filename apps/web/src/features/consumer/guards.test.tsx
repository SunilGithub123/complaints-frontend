/**
 * ConsumerRequireVerification — 1 test (the "expired token opens OTP"
 * journey is the load-bearing one per Stage 11 prompt). The happy path
 * is covered transitively by the OtpModal + SubmitScreen + Confirmation
 * tests, which all run *behind* the guard and would fail to render if it
 * mis-routed.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConsumerRequireVerification } from './guards';
import { useConsumerAuthStore } from './consumerAuthStore';

function tree(): void {
  render(
    <MemoryRouter initialEntries={['/consumer/submit']}>
      <Routes>
        <Route element={<ConsumerRequireVerification />}>
          <Route path="/consumer/submit" element={<div>protected-submit</div>} />
        </Route>
        <Route path="/consumer" element={<div>landing-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConsumerRequireVerification', () => {
  beforeEach(() => {
    useConsumerAuthStore.getState().clear();
  });

  it('redirects to /consumer when the token is expired and clears the stale slot', () => {
    useConsumerAuthStore.setState({
      token: 'old-jwt',
      // Expired 1 minute ago — the wall-clock check kicks the user back.
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      consumerId: 'CN-001',
      mobile: '9999999999',
    });

    tree();

    expect(screen.getByText('landing-screen')).toBeInTheDocument();
    expect(screen.queryByText('protected-submit')).not.toBeInTheDocument();
    // Token is wiped so the next "Send OTP" starts clean.
    expect(useConsumerAuthStore.getState().token).toBeNull();
  });
});

