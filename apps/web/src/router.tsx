/**
 * App router. Three guards layered as outlet wrappers:
 *   RequireAuth → RequirePasswordChanged → DashboardLayout → screens
 *
 * Login + ChangePassword are lazy-loaded as a small win on the initial JS
 * payload (login is the first paint for unauthenticated visitors). The
 * masterdata screens are also lazy — they only matter once authed.
 */
import { lazy, Suspense, type ReactElement } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireAuth, RequirePasswordChanged } from '@/auth/guards';

const LoginScreen = lazy(() => import('@/screens/login/LoginScreen'));
const ChangePasswordScreen = lazy(
  () => import('@/screens/change-password/ChangePasswordScreen'),
);
const DashboardLayout = lazy(() => import('@/screens/dashboard/DashboardLayout'));
const HomeScreen = lazy(() => import('@/screens/dashboard/HomeScreen'));
const SubdivisionsScreen = lazy(
  () => import('@/screens/masterdata/SubdivisionsScreen'),
);
const DistributionCentersScreen = lazy(
  () => import('@/screens/masterdata/DistributionCentersScreen'),
);
const CategoriesScreen = lazy(() => import('@/screens/masterdata/CategoriesScreen'));
const NotFoundScreen = lazy(() => import('@/screens/not-found/NotFoundScreen'));

function PageFallback(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Skeleton className="h-32 w-full max-w-md" />
    </div>
  );
}

function wrap(node: ReactElement): ReactElement {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  { path: '/login', element: wrap(<LoginScreen />) },
  {
    element: <RequireAuth />,
    children: [
      // Always allowed for authed users — even during pending password reset.
      { path: '/change-password', element: wrap(<ChangePasswordScreen />) },
      {
        element: <RequirePasswordChanged />,
        children: [
          {
            element: wrap(<DashboardLayout />),
            children: [
              { index: true, element: wrap(<HomeScreen />) },
              { path: 'masterdata/subdivisions', element: wrap(<SubdivisionsScreen />) },
              {
                path: 'masterdata/distribution-centers',
                element: wrap(<DistributionCentersScreen />),
              },
              { path: 'masterdata/categories', element: wrap(<CategoriesScreen />) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: wrap(<NotFoundScreen />) },
]);

