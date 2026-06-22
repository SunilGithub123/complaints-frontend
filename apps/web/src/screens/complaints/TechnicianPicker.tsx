/**
 * Technician picker — shared by AssignDialog and ReassignDialog.
 *
 * BE Stage 16: this used to call the ADMIN-only `/api/v1/admin/staff`
 * via `useListStaff`, which 403'd for ENGINEER users (carry-over from
 * Stage 12.1). Now uses the any-authenticated-staff
 * `/api/v1/staff/users?role=TECHNICIAN&distributionCenterId=&active=true`
 * search endpoint via the hand-rolled `useStaffDirectorySearch`.
 */
import { useMemo } from 'react';
import { type Schemas } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Select } from '@/components/ui/select';
import { useStaffDirectorySearch } from '@/features/staffDirectory/api';

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
  const { data, isLoading } = useStaffDirectorySearch({
    role: 'TECHNICIAN',
    distributionCenterId,
    active: true,
    page: 0,
    size: 100,
    sort: ['fullName,asc'],
  });

  const options = useMemo(() => {
    const rows = data?.data?.data ?? [];
    return rows
      .filter((r: Schemas.StaffDirectoryEntryResponse) => r.userId !== undefined)
      .map((r: Schemas.StaffDirectoryEntryResponse) => ({
        id: r.userId as number,
        label: `${r.fullName ?? ''} (${r.employeeId ?? ''})`,
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

