/**
 * `/complaints` — temporary entry point for the engineer/admin complaint
 * management UI. Until the paged list lands in Stage 16 we accept a
 * complaint ID and navigate to the detail screen.
 *
 * Per BE handoff (Stage 13.5): paged `/staff/complaints` is out of scope
 * for this slice. The lookup form is intentionally minimal — no MSW
 * stubbing or local fake list.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '@complaints/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ComplaintLookupScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [id, setId] = useState('');

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return;
    navigate(`/complaints/${n}`);
  }

  return (
    <section className="flex max-w-md flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">{t('complaints.lookup.heading')}</h2>
        <p className="text-sm text-[var(--color-muted-500)]">
          {t('complaints.lookup.subheading')}
        </p>
      </header>
      <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="complaint-id">{t('complaints.lookup.label')}</Label>
          <Input
            id="complaint-id"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={t('complaints.lookup.placeholder')}
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={!id || !Number.isInteger(Number(id))}>
          {t('complaints.lookup.open')}
        </Button>
      </form>
    </section>
  );
}

