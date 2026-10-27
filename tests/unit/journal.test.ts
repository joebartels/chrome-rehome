import { describe, expect, it, vi } from 'vitest';
import { createReplacementJournal, parseJournal, type ReplacementJournal } from '../../src/execution/journal';

export function record(extra: Partial<ReplacementJournal> = {}): ReplacementJournal {
  return { version: 1, operationId: 'operation', participants: [{tabId:1,incognito:false,documentId:'winner'}, {tabId:2,incognito:false,documentId:'old'}], completedPhase:'prepared', sequence:0, pending:null, removedTabIds:[], terminal:null, ...extra };
}
function fixture(initial?: unknown) {
  let stored = initial;
  const calls: string[] = [];
  const storage = { read: vi.fn(async () => { calls.push('read'); return stored; }), write: vi.fn(async (value: ReplacementJournal) => { calls.push(value.pending ? `pending:${value.pending.kind}:${value.sequence}` : value.terminal ?? value.completedPhase); stored=structuredClone(value); }), clear:vi.fn(async () => {calls.push('clear'); stored=undefined;}) };
  return { storage, calls, get stored(){return stored;}, journal:createReplacementJournal({storage,createOperationId:()=> 'operation'}) };
}
describe('strict v1 journal', () => {
  it('distinguishes missing from invalid, with detached deeply immutable round trips',async()=>{
    expect(parseJournal(undefined)).toEqual({kind:'empty'});
    const raw=record(); const read=parseJournal(raw);
    expect(read.kind).toBe('valid'); if(read.kind!=='valid')throw Error('invalid');
    expect(read.value).toEqual(raw); expect(read.value).not.toBe(raw); expect(Object.isFrozen(read.value)).toBe(true);
    expect(Object.isFrozen(read.value.participants)).toBe(true); expect(Object.isFrozen(read.value.participants[0])).toBe(true);
    const f=fixture(raw);expect(await f.journal.load()).toEqual(read);expect(f.calls).toEqual(['read']);
  });
  const invalid: [string, () => unknown][] = [
    ['null',()=>null], ['future',()=>record({version:2 as 1})], ['unknown root',()=>({...record(),url:'secret'})],
    ['inherited field',()=>Object.assign(Object.create({version:1}),{...record(),version:undefined})],
    ['inherited required',()=>{const r:Record<string,unknown>={...record()};delete r.version;return Object.assign(Object.create({version:1}),r);}],
    ['extra participant',()=>record({participants:[{tabId:1,incognito:false,documentId:'d',url:'secret'} as never]})],
    ['sparse',()=>record({participants:Array(2)})], ['extra array key',()=>{const a=[...record().participants];Object.assign(a,{secret:1});return record({participants:a});}],
    ['unsafe tab',()=>record({participants:[{tabId:Number.MAX_SAFE_INTEGER+1,incognito:false,documentId:'d'}]})],
    ['negative tab',()=>record({participants:[{tabId:-1,incognito:false,documentId:'d'}]})],
    ['duplicates',()=>record({participants:[record().participants[0]!,record().participants[0]!]})],
    ['mixed context',()=>record({participants:[record().participants[0]!,{tabId:2,incognito:true}]})],
    ['no winner doc',()=>record({participants:[{tabId:1,incognito:false}]})],
    ['empty operation',()=>record({operationId:''})], ['long operation',()=>record({operationId:'x'.repeat(129)})],
    ['long doc',()=>record({participants:[{tabId:1,incognito:false,documentId:'x'.repeat(129)}]})],
    ['101 participants',()=>record({participants:Array.from({length:101},(_,tabId)=>({tabId,incognito:false,documentId:'d'}))})],
    ['negative sequence',()=>record({sequence:-1})], ['exhausted sequence',()=>record({sequence:106})],
    ['pending cannot reuse a verified removal ordinal',()=>record({participants:[...record().participants,{tabId:3,incognito:false}],sequence:1,completedPhase:'removed',removedTabIds:[2],pending:{sequence:1,kind:'remove',tabId:3}})],
    ['pending mismatch',()=>record({sequence:1,pending:{sequence:2,kind:'move',tabId:1}})],
    ['pending wrong winner',()=>record({sequence:1,pending:{sequence:1,kind:'move',tabId:2}})],
    ['pending unknown',()=>record({sequence:1,pending:{sequence:1,kind:'other' as 'move',tabId:1}})],
    ['pending extra',()=>record({sequence:1,pending:{sequence:1,kind:'move',tabId:1,error:'secret'} as never})],
    ['pending terminal',()=>record({sequence:1,pending:{sequence:1,kind:'move',tabId:1},terminal:'abandoned'})],
    ['removed winner',()=>record({sequence:1,completedPhase:'removed',removedTabIds:[1]})],
    ['removed foreign',()=>record({sequence:1,completedPhase:'removed',removedTabIds:[3]})],
    ['removed repeated',()=>record({sequence:2,completedPhase:'removed',removedTabIds:[2,2]})],
    ['removed nonprefix',()=>record({participants:[...record().participants,{tabId:3,incognito:false}],sequence:1,completedPhase:'removed',removedTabIds:[3]})],
    ['remove before placed',()=>record({sequence:1,pending:{sequence:1,kind:'remove',tabId:2}})],
    ['remove wrong next',()=>record({sequence:2,completedPhase:'removed',removedTabIds:[2],pending:{sequence:2,kind:'remove',tabId:2}})],
    ['completed unterminated',()=>record({completedPhase:'completed'})], ['terminal wrong phase',()=>record({terminal:'completed'})],
    ['cycle',()=>{const r=record();Object.assign(r,{cycle:r});return r;}], ['oversized',()=>({...record(),secret:'x'.repeat(65536)})],
  ];
  it.each(invalid)('rejects %s without overwrite',async(_,make)=>{const raw=make();expect(parseJournal(raw)).toEqual({kind:'invalid'});const f=fixture(raw);expect(await f.journal.load()).toEqual({kind:'invalid'});expect(f.journal.isBlocked()).toBe(true);await expect(f.journal.begin(record().participants)).rejects.toThrow();expect(f.storage.write).not.toHaveBeenCalled();expect(f.storage.clear).not.toHaveBeenCalled();});
  it('prepared pending settled verified terminal clear are ordered',async()=>{
    const f=fixture();await f.journal.begin(record().participants);
    await f.journal.beforeMutation('move',1);await f.journal.settled();await f.journal.verified('move');
    await f.journal.beforeMutation('move',1);await f.journal.settled();await f.journal.verified('move');
    await f.journal.verified('placed');await f.journal.beforeMutation('remove',2);await f.journal.settled();await f.journal.verified('removed',2);await f.journal.finish('completed');await f.journal.clear();
    expect(f.calls).toEqual(['read','prepared','pending:move:1','prepared','move','pending:move:2','move','move','placed','pending:remove:3','placed','removed','completed','clear']);expect(f.stored).toBeUndefined();expect(f.journal.isBlocked()).toBe(false);
  });
  it('journal contains only exact allowed fields and no URL identity generation title or error payload',async()=>{
    const f=fixture();await f.journal.begin(record().participants);await f.journal.beforeMutation('group',1);const raw=f.stored as ReplacementJournal;
    expect(Object.keys(raw).sort()).toEqual(['version','operationId','participants','completedPhase','sequence','pending','removedTabIds','terminal'].sort());
    for(const p of raw.participants)expect(Object.keys(p).sort()).toEqual(['tabId','incognito','documentId'].sort());
    expect(Object.keys(raw.pending!).sort()).toEqual(['sequence','kind','tabId'].sort());
  });
  it('accepts 100 participants and rejects 101 without write',async()=>{const participants=Array.from({length:100},(_,tabId)=>({tabId,incognito:false,documentId:'d'}));const f=fixture();await f.journal.begin(participants);expect((f.stored as ReplacementJournal).participants).toHaveLength(100);const tooMany=fixture();await expect(tooMany.journal.begin([...participants,{tabId:100,incognito:false}])).rejects.toThrow();expect(tooMany.storage.write).not.toHaveBeenCalled();});
  it('begin never overwrites an active transaction, across journal instances',async()=>{const f=fixture(record());await expect(f.journal.begin(record().participants)).rejects.toThrow();expect(f.storage.write).not.toHaveBeenCalled();expect(f.journal.isBlocked()).toBe(true);await expect(f.journal.beforeMutation('move',1)).rejects.toThrow();});
  it('finish refuses pending native work',async()=>{const f=fixture();await f.journal.begin(record().participants);await f.journal.beforeMutation('move',1);await expect(f.journal.finish('abandoned')).rejects.toThrow();await expect(f.journal.clear()).rejects.toThrow();expect((f.stored as ReplacementJournal).pending?.kind).toBe('move');});
  it.each(['read','prepared','pending','settled','verified','finish','clear'])('blocks after %s persistence rejection without repair',async(stage)=>{
    const f=fixture();const failure=Error(stage);
    if(stage==='read'){f.storage.read.mockRejectedValueOnce(failure);expect(await f.journal.load()).toEqual({kind:'invalid'});}else{
      if(stage==='prepared')f.storage.write.mockRejectedValueOnce(failure);
      if(stage==='prepared')await expect(f.journal.begin(record().participants)).rejects.toBe(failure);else{
        await f.journal.begin(record().participants);
        if(stage==='pending'){f.storage.write.mockRejectedValueOnce(failure);await expect(f.journal.beforeMutation('move',1)).rejects.toBe(failure);}else{
          await f.journal.beforeMutation('move',1);
          if(stage==='settled'){f.storage.write.mockRejectedValueOnce(failure);await expect(f.journal.settled()).rejects.toBe(failure);}else{
            await f.journal.settled();
            if(stage==='verified'){f.storage.write.mockRejectedValueOnce(failure);await expect(f.journal.verified('placed')).rejects.toBe(failure);}else if(stage==='finish'){f.storage.write.mockRejectedValueOnce(failure);await expect(f.journal.finish('abandoned')).rejects.toBe(failure);}else{await f.journal.finish('abandoned');f.storage.clear.mockRejectedValueOnce(failure);await expect(f.journal.clear()).rejects.toBe(failure);}
          }
        }
      }
    }
    const writes=f.storage.write.mock.calls.length;const clears=f.storage.clear.mock.calls.length;expect(f.journal.isBlocked()).toBe(true);await expect(f.journal.settled()).rejects.toThrow();await expect(f.journal.clear()).rejects.toThrow();expect(f.storage.write).toHaveBeenCalledTimes(writes);expect(f.storage.clear).toHaveBeenCalledTimes(clears);
  });
});
