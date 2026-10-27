import { expect, it, vi } from 'vitest';
import { createChromeJournalStorage, JOURNAL_KEY } from '../../src/browser/journal-storage';
import type { ReplacementJournal } from '../../src/execution/journal';
it('session adapter reads writes and removes exactly one trusted-context key',async()=>{
  const raw={version:99};const get=vi.fn(async()=>({[JOURNAL_KEY]:raw,other:'secret'}));const set=vi.fn(async()=>{});const remove=vi.fn(async()=>{});const local={get:vi.fn(),set:vi.fn()};const setAccessLevel=vi.fn();
  const storage=createChromeJournalStorage({storage:{session:{get,set,remove,setAccessLevel},local}} as unknown as Pick<typeof chrome,'storage'>);
  expect(await storage.read()).toBe(raw);const value={version:1} as ReplacementJournal;await storage.write(value);await storage.clear();
  expect(get).toHaveBeenCalledExactlyOnceWith('chromeReHomeReplacementJournal');expect(set).toHaveBeenCalledExactlyOnceWith({chromeReHomeReplacementJournal:value});expect(remove).toHaveBeenCalledExactlyOnceWith('chromeReHomeReplacementJournal');expect(setAccessLevel).not.toHaveBeenCalled();expect(local.get).not.toHaveBeenCalled();expect(local.set).not.toHaveBeenCalled();
});
it.each(['read','write','clear'] as const)('forwards %s rejection without retry',async method=>{const failure=Error('storage');const fail=vi.fn(async()=>{throw failure;});const storage=createChromeJournalStorage({storage:{session:{get:fail,set:fail,remove:fail}}} as unknown as Pick<typeof chrome,'storage'>);await expect(method==='write'?storage.write({} as ReplacementJournal):storage[method]()).rejects.toBe(failure);expect(fail).toHaveBeenCalledTimes(1);});
