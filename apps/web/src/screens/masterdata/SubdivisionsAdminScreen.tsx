/**
 * Subdivision admin screen.
 *
 * Same masterdata table from Stage 4 but extended with admin actions:
 *  - "New subdivision" → opens the Create form modal.
 *  - Per-row Edit button → opens the Edit form (same modal, pre-filled).
 *  - Per-row Activate / Deactivate buttons → fire the mutation directly,
 *    invalidate the list, toast the result. Deactivate maps the 3 BE
 *    guardrail codes (SUBDIVISION_HAS_ACTIVE_DCS /
 *    SUBDIVISION_HAS_ACTIVE_STAFF) to a non-blocking toast — the row
 *    stays active and the user can resolve the underlying cause.
 *
 * Gated by RequireRole={ADMIN} at the router level — we don't re-check
 * here. See `src/auth/guards.tsx`.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListSubdivisions,
  useActivateSubdivision,
  useDeactivateSubdivision,
  getListSubdivisionsQueryKey,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { ActiveBadge, MasterdataTable } from './MasterdataTable';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { mapApiError } from '@/lib/apiErrors';
import { SubdivisionFormDialog } from './SubdivisionFormDialog';

const DEFAULT_PAGE: Schemas.Pageable = { page: 0, size: 50, sort: ['code,asc'] };

export default function SubdivisionsAdminScreen(): React.JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();
  const { show: toast } = useToast();
  const { data, isLoading, error } = useListSubdivisions({ pageable: DEFAULT_PAGE });
  const envelope = (data as
    | { data: Schemas.ApiResponsePageResponseSubdivisionResponse }
    | undefined)?.data;
  const rows = useMemo(() => envelope?.data?.content ?? [], [envelope]);

  const [editing, setEditing] = useState<Schemas.SubdivisionResponse | null>(null);
  const [creating, setCreating] = useState(false);

  const listKey = getListSubdivisionsQueryKey({ pageable: DEFAULT_PAGE });
  function refetch(): void {
    void queryClient.invalidateQueries({ queryKey: listKey });
  }

  const { mutateAsync: doActivate } = useActivateSubdivision();
  const { mutateAsync: doDeactivate } = useDeactivateSubdivision();

  async function handleSetActive(
    row: Schemas.SubdivisionResponse,
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

  return (
    <>
      <MasterdataTable<Schemas.SubdivisionResponse>
        heading={t('masterdata.subdivisions.heading')}
        subheading={t('masterdata.subdivisions.subheading')}
        isLoading={isLoading}
        error={error}
        rows={rows}
        rowKey={(r) => r.id ?? r.code ?? Math.random()}
        toolbar={
          <Button size="sm" onClick={() => setCreating(true)}>
            {t('masterdata.subdivisions.newButton')}
          </Button>
        }
        columns={[
          { key: 'id', header: t('masterdata.common.id'), render: (r) => r.id ?? '' },
          { key: 'code', header: t('masterdata.common.code'), render: (r) => r.code ?? '' },
          { key: 'name', header: t('masterdata.common.name'), render: (r) => r.name ?? '' },
          {
            key: 'district',
            header: t('masterdata.subdivisions.district'),
            render: (r) => r.district ?? '',
          },
          {
            key: 'status',
            header: t('masterdata.common.status'),
            render: (r) => <ActiveBadge active={r.active} />,
          },
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-right',
            render: (r) => (
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                  {t('common.edit')}
                </Button>
                {r.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void handleSetActive(r, false);
                    }}
                  >
                    {t('common.deactivate')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void handleSetActive(r, true);
                    }}
                  >
                    {t('common.activate')}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      <SubdivisionFormDialog
        open={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          refetch();
          toast(t('masterdata.common.createdToast'), 'success');
        }}
      />
      <SubdivisionFormDialog
        open={editing !== null}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
          toast(t('masterdata.common.updatedToast'), 'success');
        }}
      />
    </>
  );
}

