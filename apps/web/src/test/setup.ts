import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initI18n } from '@complaints/i18n';

// Boot the real i18n singleton against the EN catalogue so tests can assert
// on visible strings without re-implementing a stub. The catalogue is the
// source of truth — tests should fail if a translation key disappears.
initI18n('en');

afterEach(() => {
  cleanup();
});

