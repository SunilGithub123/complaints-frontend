/**
 * Staff management screen — Phase 2 admin write.
 *
 * Server-side pagination + filters (role, distribution centre, enabled).
 * Per-row actions: Edit, Activate / Deactivate, Reset password.
 *
 * Self-protection: rows whose `id` equals the signed-in admin's id hide
 * Deactivate & Reset. The BE also enforces this (`CANNOT_DEACTIVATE_SELF`)
 * but failing fast in the UI saves an unnecessary 4xx round-trip.
 *
 * Gated by RequireRole={ADMIN} at the router level.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListStaff,
  useCreateStaff,
  useUpdateStaff,
  useActivateStaff,
  useDeactivateStaff,
  useResetStaffPassword,
  getListStaffQueryKey,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { useAuthStore, selectStaff } from '@/auth/authStore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { mapApiError } from '@/lib/apiErrors';
import { StaffFormDialog } from './StaffFormDialog';
import { TempPasswordDialog } from './TempPasswordDialog';

const PAGE_SIZE = 20;

type RoleFilter = '' | Schemas.ListStaffRole;

interface Filters {
  role: RoleFilter;
  distributionCenterId: number | '';
  enabled: '' | 'true' | 'false';
}

interface TempPasswordContext {
  employeeId: string;
  fullName: string;
  temporaryPassword: string;
}

export default function StaffListScreen(): React.JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();
  const { show: toast } = useToast();
  const signedInStaff = useAuthStore(selectStaff);

  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>({
    role: '',
    distributionCenterId: '',
    enabled: '',
  });

  const listParams: Schemas.ListStaffParams = useMemo(() => {
    const params: Schemas.ListStaffParams = {
      pageable: { page, size: PAGE_SIZE, sort: ['employeeId,asc'] },
    };
    if (filters.role) params.role = filters.role;
    if (filters.distributionCenterId !== '')
      params.distributionCenterId = filters.distributionCenterId;
    if (filters.enabled !== '') params.enabled = filters.enabled === 'true';
    return params;
  }, [page, filters]);

  const { data, isLoading, error } = useListStaff(listParams);
  const envelope = (data as
    | { data: Schemas.ApiResponsePageResponseStaffListItemResponse }
    | undefined)?.data;
  const rows = envelope?.data?.content ?? [];
  const totalPages = envelope?.data?.totalPages ?? 1;

  const listKey = getListStaffQueryKey(listParams);
  function refetch(): void {
    void queryClient.invalidateQueries({ queryKey: listKey });
  }

  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const { mutateAsync: doActivate } = useActivateStaff();
  const { mutateAsync: doDeactivate } = useDeactivateStaff();
  const { mutateAsync: doReset, isPending: resetting } = useResetStaffPassword();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Schemas.StaffListItemResponse | null>(null);
  const [tempPassword, setTempPassword] = useState<TempPasswordContext | null>(null);

  async function handleSetActive(
    row: Schemas.StaffListItemResponse,
    active: boolean,
  ): Promise<void> {
    if (row.id === undefined) return;
    try {
      if (active) {
        await doActivate({ id: row.id });
        toast(t('masterdata.common.activatedToast'), 'success');
      } else {
        await doDeactivate({ id: row.id });
        toast(t('masterdata.common.deactivatedToast'), 'success');
      }
      refetch();
    } catch (err) {
      toast(mapApiError(err, t).message, 'warning');
    }
  }

  async function handleReset(row: Schemas.StaffListItemResponse): Promise<void> {
    if (row.id === undefined) return;
    if (
      !window.confirm(
        t('adminStaff.resetConfirm.body', { name: row.fullName ?? row.employeeId ?? '' }),
      )
    ) {
      return;
    }
    try {
      const res = (await doReset({ id: row.id })) as {
        data?: { data?: Schemas.ResetStaffPasswordResponse };
      };
      const reset = res?.data?.data;
      if (reset?.temporaryPassword) {
        setTempPassword({
          employeeId: reset.employeeId ?? row.employeeId ?? '',
          fullName: row.fullName ?? '',
          temporaryPassword: reset.temporaryPassword,
        });
      }
      refetch();
    } catch (err) {
      toast(mapApiError(err, t).message, 'warning');
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold">{t('adminStaff.heading')}</h2>
          <p className="text-sm text-[var(--color-muted-500)]">
            {t('adminStaff.subheading')}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          {t('adminStaff.newButton')}
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-role" className="text-xs font-medium">
            {t('adminStaff.filterRole')}
          </label>
          <Select
            id="filter-role"
            value={filters.role}
            onChange={(e) => {
              setPage(0);
              setFilters((f) => ({ ...f, role: e.target.value as RoleFilter }));
            }}
          >
            <option value="">{t('common.all')}</option>
            <option value="ADMIN">{t('adminStaff.role.ADMIN')}</option>
            <option value="ENGINEER">{t('adminStaff.role.ENGINEER')}</option>
            <option value="TECHNICIAN">{t('adminStaff.role.TECHNICIAN')}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-dc" className="text-xs font-medium">
            {t('adminStaff.filterDc')}
          </label>
          <input
            id="filter-dc"
            type="number"
            min={1}
            value={filters.distributionCenterId}
            onChange={(e) => {
              const v = e.target.value;
              setPage(0);
              setFilters((f) => ({
                ...f,
                distributionCenterId: v === '' ? '' : Number(v),
              }));
            }}
            className="flex h-10 w-32 rounded-md border border-[var(--color-muted-200)] bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-enabled" className="text-xs font-medium">
            {t('adminStaff.filterEnabled')}
          </label>
          <Select
            id="filter-enabled"
            value={filters.enabled}
            onChange={(e) => {
              setPage(0);
              setFilters((f) => ({
                ...f,
                enabled: e.target.value as Filters['enabled'],
              }));
            }}
          >
            <option value="">{t('common.all')}</option>
            <option value="true">{t('adminStaff.filterEnabledTrue')}</option>
            <option value="false">{t('adminStaff.filterEnabledFalse')}</option>
          </Select>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t('masterdata.common.errorTitle')}</AlertTitle>
          <AlertDescription>{mapApiError(error, t).message}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('adminStaff.table.employeeId')}</TableHead>
              <TableHead>{t('adminStaff.table.fullName')}</TableHead>
              <TableHead>{t('adminStaff.table.role')}</TableHead>
              <TableHead>{t('adminStaff.table.distributionCenterId')}</TableHead>
              <TableHead>{t('adminStaff.table.email')}</TableHead>
              <TableHead>{t('adminStaff.table.mobile')}</TableHead>
              <TableHead>{t('adminStaff.table.status')}</TableHead>
              <TableHead className="text-right">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-[var(--color-muted-500)]"
                >
                  {t('masterdata.common.empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const isSelf = row.id !== undefined && row.id === signedInStaff?.id;
                return (
                  <TableRow key={row.id ?? row.employeeId}>
                    <TableCell>{row.employeeId ?? ''}</TableCell>
                    <TableCell>{row.fullName ?? ''}</TableCell>
                    <TableCell>{row.role ?? ''}</TableCell>
                    <TableCell>{row.distributionCenterId ?? ''}</TableCell>
                    <TableCell>{row.email ?? ''}</TableCell>
                    <TableCell>{row.mobile ?? ''}</TableCell>
                    <TableCell>
                      {row.enabled === false ? (
                        <Badge tone="muted">{t('common.inactive')}</Badge>
                      ) : (
                        <Badge tone="success">{t('common.active')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(row)}
                        >
                          {t('common.edit')}
                        </Button>
                        {!isSelf &&
                          (row.enabled === false ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                void handleSetActive(row, true);
                              }}
                            >
                              {t('common.activate')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                void handleSetActive(row, false);
                              }}
                            >
                              {t('common.deactivate')}
                            </Button>
                          ))}
                        {!isSelf ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resetting}
                            onClick={() => {
                              void handleReset(row);
                            }}
                          >
                            {t('adminStaff.resetConfirm.submit')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-[var(--color-muted-500)]">
          {t('common.page', { current: page + 1, total: Math.max(totalPages, 1) })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          {t('common.previous')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('common.next')}
        </Button>
      </div>

      <StaffFormDialog
        open={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onCreated={(ctx) => {
          setCreating(false);
          refetch();
          setTempPassword(ctx);
        }}
        onUpdated={() => {
          setCreating(false);
          refetch();
          toast(t('masterdata.common.createdToast'), 'success');
        }}
        createMutation={createMutation}
        updateMutation={updateMutation}
      />
      <StaffFormDialog
        open={editing !== null}
        initial={editing}
        onClose={() => setEditing(null)}
        onCreated={() => {
          // unreachable in edit mode — kept for type completeness
        }}
        onUpdated={() => {
          setEditing(null);
          refetch();
          toast(t('masterdata.common.updatedToast'), 'success');
        }}
        createMutation={createMutation}
        updateMutation={updateMutation}
      />

      <TempPasswordDialog
        open={tempPassword !== null}
        temporaryPassword={tempPassword?.temporaryPassword ?? null}
        employeeId={tempPassword?.employeeId ?? ''}
        fullName={tempPassword?.fullName ?? ''}
        onClose={() => setTempPassword(null)}
      />
    </section>
  );
}

