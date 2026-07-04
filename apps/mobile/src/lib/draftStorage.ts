/**
 * Complaint-draft persistence for the mobile submit form.
 *
 * Mobile twin of `apps/web/src/features/consumer/draftStorage.ts`. The
 * web flavour uses `sessionStorage` so the draft dies on tab close. On
 * mobile there is no per-session storage tier — `AsyncStorage` is the
 * only KV store, and it survives across app launches. That's fine here
 * because:
 *
 *   - The draft is scoped to a single ticket-in-progress. The submit
 *     mutation clears it on success (`clearDraft()`), and the "start
 *     over" affordance clears it too.
 *   - If the user force-quits mid-form and comes back, restoring their
 *     typed description is the friendlier behaviour, not a leak.
 *   - The consumer JWT lifetime (5 min) is the real gate on the flow.
 *     The draft outliving the JWT is *expected* — that's the whole
 *     point: type description → OTP expires → re-verify → the typed
 *     description hydrates back into the form.
 *
 * Images are NOT persisted — `PreparedImage.uri` is a `file://` in the
 * cache dir that the OS can reclaim under memory pressure, and
 * re-attaching Blobs across app launches would need `expo-file-system`
 * copies into a persistent dir (complexity we haven't earned). The
 * form surfaces a "photos need to be re-picked" hint via the existing
 * `restoredDraft` i18n key.
 *
 * The `:v1` suffix in the key is the migration hook for the day we
 * change the shape — bump to `:v2`, drop reads of `:v1`. Same
 * convention as web.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage does not reject colons, but keep the convention aligned
// with `complaints_auth` / `complaints_consumer_auth` (SecureStore
// forbids them) so a future migration to SecureStore for this key is
// a rename-only change.
const KEY = 'complaintDraft_v1';

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

export async function loadDraft(): Promise<ComplaintDraft> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<ComplaintDraft>;
    return {
      categoryId:
        typeof parsed.categoryId === 'number' ? parsed.categoryId : null,
      description:
        typeof parsed.description === 'string' ? parsed.description : '',
      location: typeof parsed.location === 'string' ? parsed.location : '',
    };
  } catch {
    // AsyncStorage read failed or the payload was corrupt — treat as
    // "no draft". Losing a stale draft is better than crashing the
    // form on mount.
    return EMPTY_DRAFT;
  }
}

export async function saveDraft(draft: ComplaintDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // AsyncStorage quota / permissions — silently drop. The user
    // retypes on a re-OTP, which is annoying but not data loss.
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** True if the draft holds any user input worth restoring. */
export function draftIsNonEmpty(d: ComplaintDraft): boolean {
  return (
    d.description !== EMPTY_DRAFT.description ||
    d.categoryId !== EMPTY_DRAFT.categoryId ||
    d.location !== EMPTY_DRAFT.location
  );
}

