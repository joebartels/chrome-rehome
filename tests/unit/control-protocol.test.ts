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

test('target hints and status metadata have exact shapes without private browsing data', async () => {
  const { isControlReply } = await import('../../src/controls/protocol');
  const target = { tabId: 7, windowId: 10, incognito: false };
  expect(parseControlCommand({ kind: 'get-status', target })).toEqual({ kind: 'get-status', target });
  for (const bad of [{ ...target, title: 'private' }, { ...target, tabId: -1 }, { ...target, incognito: 0 }]) expect(parseControlCommand({ kind: 'get-status', target: bad })).toBeUndefined();
  const status = { version: expected, phase: 'active', savedEnabled: true, target: { receipt: { ...target, documentId: 'doc' }, protected: false, audible: true, pinned: false } };
  expect(isControlReply({ kind: 'ok', status })).toBe(true);
  expect(isControlReply({ kind: 'ok', status: { ...status, target: { ...status.target, url: 'private' } } })).toBe(false);
});

test('inherited command kind is not an exact command shape', () => {
  expect(parseControlCommand(Object.assign(Object.create({ kind: 'get-status' }), { extra: true }))).toBeUndefined();
});
