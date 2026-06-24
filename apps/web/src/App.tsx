import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '@complaints/i18n';
import { wireApi } from '@/auth/wireApi';
import { useAuthStore } from '@/auth/authStore';
import { router } from '@/router';
import { ToastViewport } from '@/components/ui/toast';

// Single boot wiring — happens once before React renders. Calling at module
// scope keeps the dance synchronous so `setAuthHooks` is in place by the
// time the first `useLoginStaff`/`useGetMyStaffProfile` hook fires.
wireApi();
initI18n();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

export default function App(): React.JSX.Element {
  // The transport dispatches a window-level `auth:logout` event when refresh
  // fails. We respond by clearing the store and pushing the user to /login.
  // Keeping this listener at the App level (not inside packages/api) means
  // the api package stays framework-free.
  useEffect(() => {
    function onLogout(): void {
      useAuthStore.getState().clear();
      // Hard navigation is acceptable — React Router's navigate() can't be
      // called from a non-component context, and a full nav also clears any
      // in-flight TanStack Query caches that might still reference the dead
      // token. This is fine for the once-per-session event it is.
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
    </QueryClientProvider>
  );
}

