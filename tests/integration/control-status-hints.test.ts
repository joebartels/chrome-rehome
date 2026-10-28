import { expect, test, vi } from 'vitest';
import { createStatusNotifier } from '../../src/browser/control-status-hints';
import { isStatusHint } from '../../src/controls/status-hint';
import { createReplacementJournal } from '../../src/execution/journal';
import { createRecovery } from '../../src/background/recovery';
test('status hints are exact, payload-free, and absent UI receivers do not cause retries', async () => {
  const sendMessage=vi.fn(async () => {throw Error('no UI');}); const notify=createStatusNotifier({sendMessage});
  notify(); await Promise.resolve(); expect(sendMessage).toHaveBeenCalledExactlyOnceWith({kind:'control-status-changed'});
  expect(isStatusHint({kind:'control-status-changed'})).toBe(true);
  expect(isStatusHint({kind:'control-status-changed',target:{tabId:1}})).toBe(false);
});
test('read-only completion hint exposes failed journal write as blocked without invalidating control authority', async () => {
  const journal=createReplacementJournal({storage:{read:async()=>undefined,write:async()=>{throw Error('disk');},clear:async()=>{}},createOperationId:()=> 'op'});
  const recovery=createRecovery({journal,port:{read:async()=>({tabs:[],groups:[],windows:[]})}}); await recovery.initialize();
  let status='active'; const notify=createStatusNotifier({sendMessage:async () => {status=recovery.isReady()?'active':'blocked';}});
  try {await journal.begin([{tabId:1,incognito:false,documentId:'doc'}]);}catch{}finally{notify();}
  expect(status).toBe('blocked'); expect(journal.isBlocked()).toBe(true);
});
