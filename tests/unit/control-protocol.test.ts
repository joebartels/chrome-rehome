import { expect, test } from 'vitest';
import { parseControlCommand } from '../../src/controls/protocol';
const expected = { workerId: 'worker', revision: 0 };
const rules = { groupingRules: [], duplicateRules: [] };
test('strict commands admit only finite bounded identities, exact keys and validated rule lists', () => {
  for (const command of [{ kind: 'get-status' }, { kind: 'set-enabled', expected, enabled: false },
    { kind: 'save-rules', expected, baseRules: rules, rules },
    { kind: 'set-tab-protected', expected, protected: true, target: { tabId: 1, windowId: 2, incognito: false, documentId: 'doc' } }]) {
    expect(parseControlCommand(command)).toEqual(command);
    expect(parseControlCommand({ ...command, extra: true })).toBeUndefined();
  }
  for (const raw of [null, [], { kind: 'unknown' }, { kind: 'get-status', expected },
    { kind: 'set-enabled', expected, enabled: 'false' },
    { kind: 'set-enabled', expected: { ...expected, revision: Infinity }, enabled: false },
    { kind: 'set-enabled', expected: { ...expected, revision: -1 }, enabled: false },
    { kind: 'set-enabled', expected: { ...expected, workerId: '' }, enabled: false },
    { kind: 'set-enabled', expected: { ...expected, extra: 1 }, enabled: false },
    { kind: 'save-rules', expected, baseRules: rules, rules: { ...rules, enabled: true } },
    { kind: 'save-rules', expected, baseRules: rules, rules: { ...rules, groupingRules: [{ enabled: true, pattern: '', group: '' }] } },
    { kind: 'set-tab-protected', expected, protected: true, target: { tabId: -1, windowId: 2, incognito: false, documentId: 'doc' } }]) {
    expect(parseControlCommand(raw)).toBeUndefined();
  }
});
