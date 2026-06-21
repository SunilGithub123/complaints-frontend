/**
 * TempPasswordDialog — 1 test covering the two non-negotiable rules:
 *  1. The dialog is dismissable (Close button → onClose fires).
 *  2. The temp password is NOT written to the persisted auth store
 *     (`complaints:auth` in localStorage). The dialog must hold it
 *     purely in transient component state.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TempPasswordDialog } from './TempPasswordDialog';

describe('TempPasswordDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is dismissable and never persists the password to localStorage', async () => {
    const onClose = vi.fn();
    const TEMP = 'TempP@ss-XYZ-9';
    render(
      <TempPasswordDialog
        open={true}
        temporaryPassword={TEMP}
        employeeId="TECH123"
        fullName="Tech User"
        onClose={onClose}
      />,
    );

    // Renders the password value for the admin to copy.
    expect(screen.getByText(TEMP)).toBeInTheDocument();

    // The persisted auth store key MUST NOT contain the temp password.
    const persisted = localStorage.getItem('complaints:auth') ?? '';
    expect(persisted.includes(TEMP)).toBe(false);
    // And nothing else in localStorage should contain it either.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      expect((localStorage.getItem(key) ?? '').includes(TEMP)).toBe(false);
    }

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /shared/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

