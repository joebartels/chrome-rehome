import { createProtectionRepository } from '../../src/protections/repository';
import type { ProtectionValue } from '../../src/protections/state';
import type { TabReceipt } from '../../src/controls/protocol';
export const receipt: TabReceipt = { tabId: 7, windowId: 10, incognito: false, documentId: 'document' };
export function protectionFixture(initial: unknown = undefined) {
  let raw = initial; let changed = (_raw: unknown) => {};
  let read = async (): Promise<unknown> => raw;
  let write = async (value: ProtectionValue): Promise<void> => { raw = value; changed(value); };
  let target = { receipt, audible: false, pinned: false } as { receipt: TabReceipt; audible: boolean; pinned: boolean } | undefined;
  let targetRead = async () => target;
  let live = async () => [{ tabId: 7, incognito: false }, { tabId: 8, incognito: true }];
  const writes: ProtectionValue[] = [];
  const protections = createProtectionRepository({ read: () => read(), write: value => { writes.push(value); return write(value); }, subscribe: fn => { changed = fn; return () => {}; } });
  return { protections, targets: { observe: () => ({ isCurrent: () => true, dispose() {} }), read: () => targetRead(), list: () => live() }, writes,
    get raw() { return raw; }, setRaw(value: unknown) { raw = value; },
    external(value: unknown) { raw = value; changed(value); },
    setRead(fn: typeof read) { read = fn; }, setWrite(fn: typeof write) { write = fn; },
    setTarget(value: typeof target) { target = value; }, setTargetRead(fn: typeof targetRead) { targetRead = fn; }, setLive(fn: typeof live) { live = fn; }
  };
}
