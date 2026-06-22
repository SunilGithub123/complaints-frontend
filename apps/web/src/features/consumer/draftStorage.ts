/**
 * Draft persistence for /consumer/submit. Stored under `complaintDraft:v1`
 * in `sessionStorage` so the form survives an OTP-expiry round trip but
 * doesn't outlive the tab.
 *
 * Images are NOT persisted — `File` objects can't be JSON-serialized and
 * re-hydrating Blobs across a re-OTP would need IndexedDB. If the user
 * picked photos and the token expired, we surface a banner asking them
 * to re-pick. The typed fields are the painful-to-retype bits.
 *
 * The `:v1` suffix is the migration hook for the day we change the
 * shape — bump to `:v2`, drop reads of `:v1`.
 */

const KEY = 'complaintDraft:v1';

export interface ComplaintDraft {
  categoryId: number | null;
  description: string;
  location: string;
}

export const EMPTY_DRAFT: ComplaintDraft = {
  categoryId: null,
  description: '',
  location: '',
};

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function loadDraft(): ComplaintDraft {
  if (!isStorageAvailable()) return EMPTY_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<ComplaintDraft>;
    return {
      categoryId:
        typeof parsed.categoryId === 'number' ? parsed.categoryId : null,
      description: typeof parsed.description === 'string' ? parsed.description : '',
      location: typeof parsed.location === 'string' ? parsed.location : '',
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: ComplaintDraft): void {
  if (!isStorageAvailable()) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage quota / private-mode — silently drop. The user will
    // retype on a re-OTP, which is annoying but not data loss.
  }
}

export function clearDraft(): void {
  if (!isStorageAvailable()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

