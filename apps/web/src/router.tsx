/* eslint-disable react-refresh/only-export-components -- co-located constant / hook exports are intentional; HMR isn't meaningful for these files (route wiring / cva variants / store) */
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
import { RequireAuth, RequirePasswordChanged, RequireRole } from '@/auth/guards';
import { ConsumerRequireVerification } from '@/features/consumer/guards';

const LoginScreen = lazy(() => import('@/screens/login/LoginScreen'));
const ChangePasswordScreen = lazy(
  () => import('@/screens/change-password/ChangePasswordScreen'),
);
const DashboardLayout = lazy(() => import('@/screens/dashboard/DashboardLayout'));
const HomeScreen = lazy(() => import('@/screens/dashboard/HomeScreen'));
const SubdivisionsAdminScreen = lazy(
  () => import('@/screens/masterdata/SubdivisionsAdminScreen'),
);
const DistributionCentersAdminScreen = lazy(
  () => import('@/screens/masterdata/DistributionCentersAdminScreen'),
);
const CategoriesAdminScreen = lazy(
  () => import('@/screens/masterdata/CategoriesAdminScreen'),
);
const StaffListScreen = lazy(() => import('@/screens/admin-staff/StaffListScreen'));
const ComplaintListScreen = lazy(
  () => import('@/screens/complaints/ComplaintListScreen'),
);
const ComplaintDetailScreen = lazy(
  () => import('@/screens/complaints/ComplaintDetailScreen'),
);
const ProfileScreen = lazy(() => import('@/screens/profile/ProfileScreen'));
const NotFoundScreen = lazy(() => import('@/screens/not-found/NotFoundScreen'));

// Consumer flow — lazy-loaded so staff bundles don't pay for them. The
// `browser-image-compression` library is dynamically imported deeper
// still (only when the picker fires).
const ConsumerLandingScreen = lazy(
  () => import('@/screens/consumer/LandingScreen'),
);
const ConsumerSubmitScreen = lazy(
  () => import('@/screens/consumer/SubmitScreen'),
);
const ConsumerConfirmationScreen = lazy(
  () => import('@/screens/consumer/ConfirmationScreen'),
);

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
  // Public consumer flow — no staff login required. Landing is fully
  // open; the submit + confirmation screens sit behind the consumer
  // verification guard (5-min OTP JWT).
  { path: '/consumer', element: wrap(<ConsumerLandingScreen />) },
  {
    element: <ConsumerRequireVerification />,
    children: [
      { path: '/consumer/submit', element: wrap(<ConsumerSubmitScreen />) },
      {
        path: '/consumer/submitted/:ticketNo',
        element: wrap(<ConsumerConfirmationScreen />),
      },
    ],
  },
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
              // Open to every authenticated, password-cleared staff member.
              { path: 'profile', element: wrap(<ProfileScreen />) },
              {
                // Phase 3 Stage 12: engineer + admin complaint management.
                // Scope-checked server-side; ENGINEER sees their DC,
                // ADMIN sees their subdivision. TECHNICIAN handled by
                // the mobile flow (Stage 14).
                element: <RequireRole roles={['ADMIN', 'ENGINEER']} />,
                children: [
                  { path: 'complaints', element: wrap(<ComplaintListScreen />) },
                  {
                    path: 'complaints/:id',
                    element: wrap(<ComplaintDetailScreen />),
                  },
                ],
              },
              {
                // Phase 2: master-data write screens + staff management,
                // all admin-only. Gate the whole sub-tree once.
                element: <RequireRole roles={['ADMIN']} />,
                children: [
                  {
                    path: 'masterdata/subdivisions',
                    element: wrap(<SubdivisionsAdminScreen />),
                  },
                  {
                    path: 'masterdata/distribution-centers',
                    element: wrap(<DistributionCentersAdminScreen />),
                  },
                  {
                    path: 'masterdata/categories',
                    element: wrap(<CategoriesAdminScreen />),
                  },
                  { path: 'admin/staff', element: wrap(<StaffListScreen />) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: wrap(<NotFoundScreen />) },
]);
