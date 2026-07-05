/**
 * index (role chooser + staff home) — 2 tests per the minimum-test
 * policy.
 *
 *   1. Happy anonymous: role-chooser CTAs are rendered + tapping
 *      "File a complaint" routes to `/(consumer)/landing`.
 *   2. Happy authenticated: with an accessToken in the store, the
 *      chooser is NOT rendered — the staff welcome copy is.
 *
 * The `usePushRegistration` hook fires on the authenticated branch;
 * we mock it so no push state leaks between tests. `LanguageToggle`
 * is rendered as-is (thin wrapper over `useCurrentLocale`) — testing
 * i18n switching lives in the i18n package.
 */
import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './index';
import { useAuthStore } from '@/auth/authStore';

// Fixed insets stub — same trick as landing.test.tsx — so we don't
// need a real SafeAreaProvider bound to a device metrics source.
const INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FRAME = { x: 0, y: 0, width: 320, height: 640 };

const mockPush = jest.fn();
const mockRunIfNeeded = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Redirect: ({ href }: { href: string }) => `Redirect:${href}`,
}));

jest.mock('@/lib/usePushRegistration', () => ({
  usePushRegistration: () => ({ runIfNeeded: mockRunIfNeeded }),
}));

function renderScreen(): void {
  render(
    <SafeAreaProvider initialMetrics={{ insets: INSETS, frame: FRAME }}>
      <HomeScreen />
    </SafeAreaProvider>,
  );
}

// `usePersistHydrated` reads from `useAuthStore.persist.hasHydrated()`.
// Zustand's persist middleware exposes a sync hydration flag which,
// under jest + the default AsyncStorage mock, resolves synchronously.
// Force `hasHydrated` to true so we don't render the invisible
// placeholder branch.
beforeEach(() => {
  mockPush.mockReset();
  mockRunIfNeeded.mockReset();
  useAuthStore.getState().clear();
  // Zustand persist reports `hasHydrated()` = false until the async
  // rehydrate microtask lands, and even then it's driven by an event
  // that RTL's synchronous first render can miss under jest-expo.
  // Spy to force the ready state so tests exercise the real render
  // branches instead of the invisible-placeholder branch.
  jest.spyOn(useAuthStore.persist, 'hasHydrated').mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('index (role chooser + staff home)', () => {
  it('renders the role chooser when anonymous and routes to consumer landing on tap', async () => {
    const user = userEvent.setup();
    renderScreen();

    // Chooser copy visible.
    expect(await screen.findByText('Complaint Resolution System')).toBeOnTheScreen();
    const consumerCta = screen.getByRole('button', { name: 'File a complaint' });
    expect(consumerCta).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Staff sign in' })).toBeOnTheScreen();

    await user.press(consumerCta);
    expect(mockPush).toHaveBeenCalledWith('/(consumer)/landing');
  });

  it('shows the staff welcome (not the chooser) when an access token is present', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'access-abc',
      refreshToken: 'refresh-xyz',
      staff: {
        id: 1,
        employeeId: 'EMP001',
        fullName: 'Anita Rao',
        role: 'ADMIN',
        passwordResetRequired: false,
        notificationsPushEnabled: true,
      },
    });

    renderScreen();

    expect(await screen.findByText(/Welcome, Anita Rao/)).toBeOnTheScreen();
    expect(screen.queryByText('Complaint Resolution System')).not.toBeOnTheScreen();
  });
});





