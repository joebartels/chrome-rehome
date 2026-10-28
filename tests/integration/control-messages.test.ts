import { expect, test } from 'vitest';
import { registerControlMessages } from '../../src/browser/control-messages';
import { createControlClient } from '../../src/controls/client';
const status = { version: { workerId: 'worker', revision: 1 }, phase: 'paused', savedEnabled: false } as const;
test('only exact extension popup/options pages get async replies, using literal true for Chrome 120', async () => {
  let listener!: Parameters<typeof chrome.runtime.onMessage.addListener>[0];
  const runtime = { id: 'self', getURL: (path: string) => `chrome-extension://self/${path}`,
    onMessage: { addListener(value: typeof listener) { listener = value; }, removeListener(value: typeof listener) { expect(value).toBe(listener); } } };
  let calls = 0; const replies: unknown[] = [];
  const dispose = registerControlMessages(runtime as unknown as typeof chrome.runtime, { async handle() { calls++; return { kind: 'ok' as const, status }; } });
  for (const sender of [{ id: 'other', url: 'chrome-extension://self/options/index.html' },
    { id: 'self', url: 'https://example.com/options/index.html' }, { id: 'self', url: 'chrome-extension://self/options/index.html?x' },
    { id: 'self', url: 'chrome-extension://self/options/index.html#x' }, { id: 'self', url: 'chrome-extension://self/background.js' },
    { id: 'self', url: 'chrome-extension://self/options/index.html', tab: { id: 1 }, frameId: 1 }]) {
    expect(listener({ kind: 'get-status' }, sender as chrome.runtime.MessageSender, value => { replies.push(value); })).not.toBe(true);
  }
  expect(calls).toBe(0);
  for (const page of ['options/index.html', 'popup/index.html']) {
    expect(listener({ kind: 'get-status' }, { id: 'self', url: `chrome-extension://self/${page}`, frameId: 0 }, value => { replies.push(value); })).toBe(true);
  }
  await Promise.resolve(); expect(replies).toEqual([{ kind: 'ok', status }, { kind: 'ok', status }]); expect(calls).toBe(2); dispose();
});
test('client sends narrow commands once and never retries uncertain failures', async () => {
  const sent: unknown[] = [];
  const client = createControlClient({ async sendMessage(message: unknown) { sent.push(message); throw Error('disconnected'); } });
  await expect(client.getStatus()).rejects.toThrow(); expect(sent).toEqual([{ kind: 'get-status' }]);
});
