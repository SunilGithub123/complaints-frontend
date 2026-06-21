import { useListDcs, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { ActiveBadge, MasterdataTable } from './MasterdataTable';

const DEFAULT_PAGE: Schemas.Pageable = { page: 0, size: 50, sort: ['code,asc'] };

export default function DistributionCentersScreen(): React.JSX.Element {
  const t = useT();
  const { data, isLoading, error } = useListDcs({ pageable: DEFAULT_PAGE });
  const envelope = (data as
    | { data: Schemas.ApiResponsePageResponseDistributionCenterResponse }
    | undefined)?.data;
  const rows = envelope?.data?.content ?? [];

  return (
    <MasterdataTable<Schemas.DistributionCenterResponse>
      heading={t('masterdata.distributionCenters.heading')}
      subheading={t('masterdata.distributionCenters.subheading')}
      isLoading={isLoading}
      error={error}
      rows={rows}
      rowKey={(r) => r.id ?? r.code ?? Math.random()}
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
      ]}
    />
  );
}

