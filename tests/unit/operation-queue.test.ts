import { describe, expect, it, vi } from 'vitest';
import { createReplacementExecutor } from '../../src/execution/replacement';
import { replacementFixture } from '../fixtures/replacement';
import { createOperationQueue } from '../../src/background/operation-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('operation queue', () => {
  it('keeps later jobs blocked while the first job is unresolved, without timers', async () => {
    const queue = createOperationQueue();
    const pending = deferred<void>();
    const started = deferred<void>();
    const order: string[] = [];
    const first = queue.run(async () => {
      order.push('first-start');
      started.resolve();
      await pending.promise;
      order.push('first-end');
    });
    const second = queue.run(async () => { order.push('second-start'); });
    await started.promise;
    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    pending.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('starts queued jobs in FIFO order after each prior job settles', async () => {
    const queue = createOperationQueue();
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const order: number[] = [];
    const first = queue.run(async () => {
      order.push(1);
      firstStarted.resolve();
      await firstGate.promise;
    });
    const second = queue.run(async () => {
      order.push(2);
      secondStarted.resolve();
      await secondGate.promise;
    });
    const third = queue.run(async () => { order.push(3); });
    await firstStarted.promise;
    expect(order).toEqual([1]);
    firstGate.resolve();
    await secondStarted.promise;
    expect(order).toEqual([1, 2]);
    secondGate.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('returns the original result object', async () => {
    const queue = createOperationQueue();
    const value = { tabId: 42 };
    expect(await queue.run(async () => value)).toBe(value);
  });

  it('preserves a rejection and allows the third job after a failed second job', async () => {
    const queue = createOperationQueue();
    const failure = new Error('failed operation');
    const gate = deferred<void>();
    const order: number[] = [];
    const first = queue.run(async () => { order.push(1); await gate.promise; });
    const second = queue.run(async () => { order.push(2); throw failure; });
    const rejected = expect(second).rejects.toBe(failure);
    const third = queue.run(async () => { order.push(3); return 'finished'; });
    gate.resolve();
    await first;
    await rejected;
    expect(await third).toBe('finished');
    expect(order).toEqual([1, 2, 3]);
  });

  it('turns a synchronous job throw into a rejection without stopping later jobs', async () => {
    const queue = createOperationQueue();
    const failure = new Error('synchronous failure');
    await expect(queue.run(() => { throw failure; })).rejects.toBe(failure);
    expect(await queue.run(async () => 7)).toBe(7);
  });
});

it('sole queue awaits actual rejection and failed settlement write before denying later mutation',async()=>{
  vi.useFakeTimers();
  try {
    const f=replacementFixture();const entered=deferred<void>();const release=deferred<void>();const order:string[]=[];const nativeCause={native:true};let pending=false;
    f.port.removeTab=async()=>{order.push('native-start');entered.resolve();await release.promise;order.push('native-reject');throw nativeCause;};
    f.boundary(async name=>{if(name==='journal:pending:remove')pending=true;else if(pending&&name==='journal:placed'){order.push('settled-write');throw Error('storage');}});
    const executor=createReplacementExecutor({port:f.port,journal:f.journal});const queue=createOperationQueue();const first=queue.run(()=>executor.execute(f.plan,f.guard));await entered.promise;
    const second=queue.run(async()=>{order.push('second');return executor.execute(f.plan,f.guard);});
    await vi.advanceTimersByTimeAsync(3600000);expect(order).toEqual(['native-start']);release.resolve();const [a,b]=await Promise.all([first,second]);expect(a).toMatchObject({kind:'stopped',cause:nativeCause,uncertainRemovalId:2});expect(b.kind).toBe('stopped');expect(order).toEqual(['native-start','native-reject','settled-write','second']);expect(f.journal.isBlocked()).toBe(true);expect(f.removed).toEqual([]);
  } finally { vi.useRealTimers(); }
});
