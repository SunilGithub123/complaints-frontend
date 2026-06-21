/**
 * Shared masterdata list shell. Extracted once the second list screen
 * needed the same loading / error / empty pattern — per the
 * "add the abstraction the *second* time you need it" rule. Three
 * callsites (subdivisions, distribution centres, categories) make the
 * generic worth its keep.
 *
 * Read-only this stage. Admin write actions are out of scope (Phase 2).
 */
import { ApiError } from '@complaints/api';
import { useT } from '@complaints/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface MasterdataColumn<TRow> {
  key: string;
  header: string;
  render: (row: TRow) => React.ReactNode;
  className?: string;
}

export interface MasterdataTableProps<TRow> {
  heading: string;
  subheading: string;
  columns: ReadonlyArray<MasterdataColumn<TRow>>;
  rows: ReadonlyArray<TRow> | undefined;
  isLoading: boolean;
  error: unknown;
  rowKey: (row: TRow) => string | number;
}

export function MasterdataTable<TRow>({
  heading,
  subheading,
  columns,
  rows,
  isLoading,
  error,
  rowKey,
}: MasterdataTableProps<TRow>): React.JSX.Element {
  const t = useT();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">{heading}</h2>
        <p className="text-sm text-[var(--color-muted-500)]">{subheading}</p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t('masterdata.common.errorTitle')}</AlertTitle>
          <AlertDescription>
            {error instanceof ApiError ? error.message : t('errors.network')}
          </AlertDescription>
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
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows && rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-[var(--color-muted-500)]"
                >
                  {t('masterdata.common.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Stable "Active / Inactive" badge cell used by every masterdata screen. */
export function ActiveBadge({ active }: { active: boolean | undefined }): React.JSX.Element {
  const t = useT();
  return active ? (
    <Badge tone="success">{t('common.active')}</Badge>
  ) : (
    <Badge tone="muted">{t('common.inactive')}</Badge>
  );
}

