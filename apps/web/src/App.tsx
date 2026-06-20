import { formatIstDateTime, IST_TIMEZONE } from '@complaints/utils';
// Stage 3 smoke import: prove the orval-generated TS chain compiles end-to-end.
// We import the hook + a generated type but do not call them — Stage 4 owns UI.
import { useMe, type Schemas } from '@complaints/api';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _StaffSummarySmoke = Schemas.StaffSummaryResponse;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _useMeSmoke: typeof useMe = useMe;

export default function App() {
  return (
    <main className="page">
      <h1>Complaint Resolution System</h1>
      <p>
        Frontend scaffold — <strong>Phase 0 complete</strong>.
      </p>
      <ul>
        <li>Timezone in use: <code>{IST_TIMEZONE}</code></li>
        <li>Right now (IST): <code>{formatIstDateTime(new Date().toISOString())}</code></li>
      </ul>
      <p>
        Next: <strong>Phase 1</strong> — staff login + master data CRUD. See{' '}
        <a href="../../complaints/docs/ROADMAP.md">../../complaints/docs/ROADMAP.md</a>.
      </p>
    </main>
  );
}

