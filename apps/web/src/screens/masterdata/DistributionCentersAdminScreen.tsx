/**
 * Distribution Centre admin screen — same shape as SubdivisionsAdminScreen
 * (toolbar + per-row Edit / Activate / Deactivate). Gated by
 * RequireRole={ADMIN} at the router level.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListDistributionCenters,
  useActivateDistributionCenter,
  useDeactivateDistributionCenter,
  getListDistributionCentersQueryKey,
  type Schemas,
} from '@complaints/api';
import { useT } from '@complaints/i18n';
import { ActiveBadge, MasterdataTable } from './MasterdataTable';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { mapApiError } from '@/lib/apiErrors';
import { DistributionCenterFormDialog } from './DistributionCenterFormDialog';

const DEFAULT_PAGE: Schemas.Pageable = { page: 0, size: 50, sort: ['code,asc'] };

export default function DistributionCentersAdminScreen(): React.JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();
  const { show: toast } = useToast();
  const { data, isLoading, error } = useListDistributionCenters({ pageable: DEFAULT_PAGE });
  const envelope = (data as
    | { data: Schemas.ApiResponsePageResponseDistributionCenterResponse }
    | undefined)?.data;
  const rows = useMemo(() => envelope?.data?.content ?? [], [envelope]);

  const [editing, setEditing] = useState<Schemas.DistributionCenterResponse | null>(null);
  const [creating, setCreating] = useState(false);

  const listKey = getListDistributionCentersQueryKey({ pageable: DEFAULT_PAGE });
  function refetch(): void {
    void queryClient.invalidateQueries({ queryKey: listKey });
  }

  const { mutateAsync: doActivate } = useActivateDistributionCenter();
  const { mutateAsync: doDeactivate } = useDeactivateDistributionCenter();

  async function handleSetActive(
    row: Schemas.DistributionCenterResponse,
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
      <MasterdataTable<Schemas.DistributionCenterResponse>
        heading={t('masterdata.distributionCenters.heading')}
        subheading={t('masterdata.distributionCenters.subheading')}
        isLoading={isLoading}
        error={error}
        rows={rows}
        rowKey={(r) => r.id ?? r.code ?? Math.random()}
        toolbar={
          <Button size="sm" onClick={() => setCreating(true)}>
            {t('masterdata.distributionCenters.newButton')}
          </Button>
        }
        columns={[
          { key: 'id', header: t('masterdata.common.id'), render: (r) => r.id ?? '' },
          { key: 'code', header: t('masterdata.common.code'), render: (r) => r.code ?? '' },
          { key: 'name', header: t('masterdata.common.name'), render: (r) => r.name ?? '' },
          {
            key: 'subdivisionId',
            header: t('masterdata.distributionCenters.subdivisionId'),
            render: (r) => r.subdivisionId ?? '',
          },
          {
            key: 'address',
            header: t('masterdata.distributionCenters.address'),
            render: (r) => r.address ?? '',
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

      <DistributionCenterFormDialog
        open={creating}
        initial={null}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          refetch();
          toast(t('masterdata.common.createdToast'), 'success');
        }}
      />
      <DistributionCenterFormDialog
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

