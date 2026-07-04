/**
 * draftStorage — 2 tests per the minimum-test policy.
 *
 * The helper is thin (JSON.stringify + parse over AsyncStorage) but
 * NOT a 3-line passthrough — it has a shape guard against corrupt
 * payloads that we want a regression test for.
 *
 *   1. Happy: save → load round trip preserves shape.
 *   2. Unhappy: a corrupt payload in storage yields `EMPTY_DRAFT`
 *      instead of throwing.
 *
 * jest-expo's preset already mocks `@react-native-async-storage/async-storage`
 * with an in-memory implementation, so no explicit mock is needed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadDraft,
  saveDraft,
  clearDraft,
  EMPTY_DRAFT,
  draftIsNonEmpty,
} from './draftStorage';

describe('draftStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a non-empty draft through save + load', async () => {
    const draft = {
      categoryId: 7,
      description: 'Pole-mounted transformer humming loudly.',
      location: 'Near market square',
    };

    await saveDraft(draft);
    const loaded = await loadDraft();

    expect(loaded).toEqual(draft);
    expect(draftIsNonEmpty(loaded)).toBe(true);

    await clearDraft();
    expect(await loadDraft()).toEqual(EMPTY_DRAFT);
  });

  it('returns EMPTY_DRAFT when the stored payload is corrupt', async () => {
    // Bypass saveDraft to plant garbage. loadDraft's try/catch is what
    // we're actually exercising here — a JSON.parse throw should NOT
    // crash the submit screen on mount.
    await AsyncStorage.setItem('complaintDraft_v1', 'not-json{{{');

    const loaded = await loadDraft();
    expect(loaded).toEqual(EMPTY_DRAFT);
    expect(draftIsNonEmpty(loaded)).toBe(false);
  });
});

