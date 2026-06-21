import { useNavigate } from 'react-router-dom';
import { useT } from '@complaints/i18n';
import { Button } from '@/components/ui/button';

export default function NotFoundScreen(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-[var(--color-muted-500)]">{t('notFound.body')}</p>
      <Button onClick={() => navigate('/')}>{t('notFound.backHome')}</Button>
    </main>
  );
}


