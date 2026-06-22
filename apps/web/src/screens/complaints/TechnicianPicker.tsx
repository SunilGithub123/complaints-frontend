/**
 * Technician picker — shared by AssignDialog and ReassignDialog.
 *
 * Calls `useListStaff` with `role=TECHNICIAN, distributionCenterId=<dc>,
 * enabled=true`. We surface a single page of 100 — every DC has well
 * under that in practice, and the BE enforces DC scope on the assign
 * mutation anyway (we just save a round-trip).
 */
import { useMemo } from 'react';
import { useListStaff, type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Select } from '@/components/ui/select';

export interface TechnicianPickerProps {
  id: string;
  distributionCenterId: number;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

export function TechnicianPicker({
  id,
  distributionCenterId,
  value,
  onChange,
  invalid,
}: TechnicianPickerProps): React.JSX.Element {
  const t = useT();
  const { data, isLoading } = useListStaff({
    pageable: { page: 0, size: 100, sort: ['fullName,asc'] },
    role: 'TECHNICIAN',
    distributionCenterId,
    enabled: true,
  });

  const options = useMemo(() => {
    const env = (data as
      | { data: Schemas.ApiResponsePageResponseStaffListItemResponse }
      | undefined)?.data;
    const content = env?.data?.content ?? [];
    return content
      .filter((s) => s.id !== undefined)
      .map((s) => ({
        id: s.id as number,
        label: `${s.fullName ?? ''} (${s.employeeId ?? ''})`,
      }));
  }, [data]);

  return (
    <>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        disabled={isLoading}
      >
        <option value="">{t('complaints.assign.technicianPlaceholder')}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      {!isLoading && options.length === 0 ? (
        <p className="text-xs text-[var(--color-muted-500)]">
          {t('complaints.assign.noTechnicians')}
        </p>
      ) : null}
    </>
  );
}

