import { useT } from '@complaints/i18n';

export default function HomeScreen(): React.JSX.Element {
  const t = useT();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-2xl font-semibold">{t('staff.dashboard.homeHeading')}</h2>
      <p className="text-sm text-[var(--color-muted-500)]">{t('staff.dashboard.homeBody')}</p>
    </section>
  );
}

