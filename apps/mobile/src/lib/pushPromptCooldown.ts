/**
 * `pushPromptCooldown` — 7-day debounce for the "would you like to enable
 * notifications?" system prompt.
 *
 * Contract §9.6:
 *   > If denied: FE does not call POST /devices (no token to send);
 *   > re-prompts at most once per 7 days (tracked client-side).
 *
 * Persistence per principal kind (staff vs consumer): a household device
 * that has one staff user + one consumer must be able to prompt each
 * once even if the other already denied. Two AsyncStorage keys, same
 * shape.
 *
 * We record ONLY the "last denied at" timestamp. A "last granted at"
 * would be redundant — grant flips `lastRegisteredDeviceId` on the
 * auth store, which is the actual gate on whether we re-prompt.
 *
 * Failure modes are all soft: an AsyncStorage read/write error just
 * means we might re-prompt sooner than 7 days on that install (or,
 * conversely, never prompt again until the next grant). Neither is
 * data-loss; both are recoverable by the user tapping the enable
 * button in a future settings screen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Principal = 'staff' | 'consumer';

const KEY_PREFIX = 'pushPromptDeniedAt_v1_';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function key(principal: Principal): string {
  return `${KEY_PREFIX}${principal}`;
}

/**
 * Read the "last denied at" timestamp for `principal`. Returns `null`
 * if never denied (or on any read error — a corrupt payload is treated
 * as "never" so we don't strand the user in a never-prompt state).
 */
export async function loadDeniedAt(
  principal: Principal,
): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(principal));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist "user just denied" — call from the trigger site's catch arm. */
export async function markDenied(
  principal: Principal,
  now: number = Date.now(),
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(principal), String(now));
  } catch {
    // Silent — see file header. The worst case is we re-prompt sooner.
  }
}

/** Explicit reset — e.g. after a settings-screen "enable notifications" tap. */
export async function clearDenied(principal: Principal): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(principal));
  } catch {
    // ignore
  }
}

/**
 * True iff the last-denied timestamp is inside the 7-day window.
 * Callers gate their prompt on `!(await isCoolingDown(principal))`.
 */
export async function isCoolingDown(
  principal: Principal,
  now: number = Date.now(),
): Promise<boolean> {
  const at = await loadDeniedAt(principal);
  if (at === null) return false;
  return now - at < COOLDOWN_MS;
}

/** Test-only knob so a test doesn't have to wait 7 days. */
export const __COOLDOWN_MS_FOR_TESTS__ = COOLDOWN_MS;

