import { describe, expect, it } from 'vitest';
import { gateOutcome, observeAdmission, recoveryHandled, phaseBelongsToAdmission, type Attention } from '../browser/recovery-observations';
const expected = {windowId: 7, tabId: 12, url: 'https://fixture.test/target', previousDocumentId: 'old'};
const incoming = {tabId: 12, url: expected.url, documentId: 'new', kind: 'committed'};
const foreground: Attention = {focusedWindowId: 7, activeTabs: [{windowId: 7, tabId: 12}]};
describe('native admission evidence', () => {
  it('publishes first relevant mismatch so phase waiting fails immediately', () => {
    const admission = observeAdmission('armed', expected, incoming, { ...foreground, focusedWindowId: null }, true);
    expect(admission?.mismatch).toBe(true);
    expect(() => gateOutcome('armed', undefined, admission)).toThrow(/attention-contract/);
  });
  it('preserves the actual native reader object and still waits for phase arrival', () => {
    const admission = observeAdmission('armed', expected, incoming, foreground, true);
    expect(admission?.attention).toBe(foreground);
    expect(admission?.mismatch).toBe(false);
    expect(gateOutcome('armed', undefined, admission)).toBe(false);
    expect(gateOutcome('armed', {token: 'armed'}, admission)).toBe(true);
  });
  it('treats undefined native attention and wrong selection as mismatches', () => {
    expect(observeAdmission('armed', expected, incoming, undefined, true)?.mismatch).toBe(true);
    expect(observeAdmission('armed', expected, incoming, {focusedWindowId: 7, activeTabs: [{windowId:7, tabId:99}]}, true)?.mismatch).toBe(true);
  });
  it('does not diagnose background arms, earlier documents, unrelated winners, or post-move reads', () => {
    expect(observeAdmission('armed', undefined, incoming, foreground, true)).toBeUndefined();
    for (const event of [{...incoming, tabId: 99}, {...incoming, url: 'https://fixture.test/before'}, {...incoming, documentId: 'old'}, {...incoming, documentId: undefined}])
      expect(observeAdmission('armed', expected, event as typeof incoming, foreground, true)).toBeUndefined();
    expect(observeAdmission('armed', expected, incoming, foreground, false)).toBeUndefined();
  });
  it('ignores a matching phase label from earlier setup or a different incoming document', () => {
    const admission = observeAdmission('armed', expected, incoming, foreground, true);
    expect(phaseBelongsToAdmission('armed', incoming, admission)).toBe(true);
    expect(phaseBelongsToAdmission('armed', undefined, admission)).toBe(false);
    expect(phaseBelongsToAdmission('armed', {...incoming, documentId:'old'}, admission)).toBe(false);
    expect(phaseBelongsToAdmission('armed', incoming, undefined)).toBe(false);
    expect(phaseBelongsToAdmission('stale', incoming, admission)).toBe(false);
  });
  it('ignores stale admission and reached tokens', () => {
    const admission = observeAdmission('old', expected, incoming, undefined, true);
    expect(gateOutcome('armed', {token:'old'}, admission)).toBe(false);
  });
});
describe('new realm recovery completion', () => {
  it('waits for a delayed acknowledgment of the intended navigation after initialization', async () => {
    const state = {realm:'new-realm', initialized:true, handled:[] as typeof incoming[]};
    expect(recoveryHandled('old-realm', incoming, state)).toBe(false);
    await Promise.resolve().then(() => state.handled.push(incoming));
    expect(recoveryHandled('old-realm', incoming, state)).toBe(true);
  });
  it('rejects old realms, incomplete initialization and stale/other navigation acknowledgments', () => {
    for (const state of [
      {realm:'old-realm', initialized:true, handled:[incoming]},
      {realm:'new-realm', initialized:false, handled:[incoming]},
      ...[{...incoming, documentId:'old'}, {...incoming, tabId:99}, {...incoming, url:'https://fixture.test/other'}, {...incoming,kind:'history'}].map(event => ({realm:'new-realm',initialized:true,handled:[event]}))
    ]) expect(recoveryHandled('old-realm', incoming, state)).toBe(false);
  });
});
