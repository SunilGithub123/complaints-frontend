/**
 * Dashboard shell. Hosts the side-nav + top bar; child route renders via
 * <Outlet />. Role-aware nav: admins see master-data links; engineers and
 * technicians get only the home link this stage (their dedicated screens
 * land in Phase 3+).
 *
 * Logout flow: calls `useLogout` mutation (best-effort — backend revokes
 * the refresh token), clears the store regardless of the response, then
 * navigates to /login. We don't block UI on the mutation result because
 * a 401 there should still log the user out client-side.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLogout } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useAuthStore } from '@/auth/authStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
}

const ADMIN_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'staff.dashboard.navHome' },
  { to: '/complaints', labelKey: 'staff.dashboard.navComplaints' },
  { to: '/masterdata/subdivisions', labelKey: 'staff.dashboard.navSubdivisions' },
  {
    to: '/masterdata/distribution-centers',
    labelKey: 'staff.dashboard.navDistributionCenters',
  },
  { to: '/masterdata/categories', labelKey: 'staff.dashboard.navCategories' },
  { to: '/admin/staff', labelKey: 'staff.dashboard.navStaff' },
  { to: '/profile', labelKey: 'staff.dashboard.navProfile' },
];

const ENGINEER_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'staff.dashboard.navHome' },
  { to: '/complaints', labelKey: 'staff.dashboard.navComplaints' },
  { to: '/profile', labelKey: 'staff.dashboard.navProfile' },
];

const NON_ADMIN_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'staff.dashboard.navHome' },
  { to: '/profile', labelKey: 'staff.dashboard.navProfile' },
];

export default function DashboardLayout(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const staff = useAuthStore((s) => s.staff);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const { mutateAsync: doLogout, isPending: loggingOut } = useLogout();

  const navItems =
    staff?.role === 'ADMIN'
      ? ADMIN_NAV
      : staff?.role === 'ENGINEER'
        ? ENGINEER_NAV
        : NON_ADMIN_NAV;

  async function handleLogout(): Promise<void> {
    try {
      if (refreshToken) {
        await doLogout({ data: { refreshToken } });
      }
    } catch {
      // best-effort — server-side revoke can fail; we still clear locally.
    } finally {
      clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-muted-50)]">
      <header className="flex items-center justify-between border-b border-[var(--color-muted-200)] bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-[var(--color-muted-900)]">
          {t('staff.login.subtitle')}
        </h1>
        <div className="flex items-center gap-3">
          {staff ? (
            <div className="text-right text-sm">
              <p className="font-medium">
                {t('staff.dashboard.welcome', { name: staff.fullName ?? '' })}
              </p>
              <p className="text-xs text-[var(--color-muted-500)]">
                {t('staff.dashboard.role', { role: staff.role ?? '' })}
              </p>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleLogout();
            }}
            disabled={loggingOut}
          >
            {t('common.logout')}
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <nav
          aria-label="Primary"
          className="w-56 shrink-0 border-r border-[var(--color-muted-200)] bg-white p-4"
        >
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]'
                        : 'text-[var(--color-muted-900)] hover:bg-[var(--color-muted-50)]',
                    )
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

