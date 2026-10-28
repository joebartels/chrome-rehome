import { expect, type BrowserContext, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Chrome's action target is absent from Playwright's Page events. Attach to its real
// CDP target; use real input events and capture its rendered surface without a clone.
export async function attachActionPopup(context: BrowserContext, url: string) {
  const browser = await context.browser()!.newBrowserCDPSession();
  const targets = (await browser.send('Target.getTargets')).targetInfos.filter(target => target.url === url);
  expect(targets).toHaveLength(1);
  const target = targets[0]!;
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let sequence = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const receive = ({ sessionId: from, message }: { sessionId: string; message: string }) => {
    if (from !== sessionId) return;
    const reply = JSON.parse(message) as { id?: number; result?: unknown; error?: { message: string } };
    if (!reply.id) return;
    const request = pending.get(reply.id); if (!request) return;
    pending.delete(reply.id); clearTimeout(request.timer);
    if (reply.error) request.reject(Error(reply.error.message)); else request.resolve(reply.result);
  };
  browser.on('Target.receivedMessageFromTarget', receive);
  async function send<T>(method: string, params = {}): Promise<T> {
    const id = ++sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error('Action target command timed out: ' + method)); }, 10_000);
      pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      void browser.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
        pending.delete(id); clearTimeout(timer); reject(error);
      });
    });
  }
  async function evaluate<T>(expression: string): Promise<T> {
    const reply = await send<{ result: { value: T }; exceptionDetails?: unknown }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw Error('Action evaluation failed: ' + JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  }
  await send('Runtime.enable');
  return {
    target,
    evaluate,
    heading: () => evaluate<string>('document.querySelector("#status-heading").textContent'),
    checked: () => evaluate<boolean>('document.querySelector("#protect").checked'),
    enabled: () => evaluate<boolean>('!document.querySelector("#protect").disabled'),
    async click(selector: string) {
      const point = await evaluate<{ x: number; y: number }>(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.disabled) throw Error('Control unavailable'); element.scrollIntoView({block:'center'}); const rect = element.getBoundingClientRect(); return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    },
    async press(key: 'Tab' | 'Enter', shift = false) {
      const keyCode = key === 'Tab' ? 9 : 13;
      const event = { key, code: key, windowsVirtualKeyCode: keyCode, modifiers: shift ? 8 : 0 };
      await send('Input.dispatchKeyEvent', { type: key === 'Tab' ? 'rawKeyDown' : 'keyDown', ...event });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    },
    async screenshot(info: TestInfo, name: string) {
      await evaluate('window.scrollTo(0,0)');
      const metrics=await evaluate('({width:innerWidth,height:innerHeight,scale:devicePixelRatio,font:getComputedStyle(document.body).fontSize,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth})');
      await info.attach(name+'-metrics',{body:JSON.stringify(metrics),contentType:'application/json'});
      const { data } = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
      const path = info.outputPath(name + '.png'); await writeFile(path, Buffer.from(data, 'base64')); await info.attach(name, { path, contentType: 'image/png' });
    },
    async close() {
      try { await browser.send('Target.closeTarget', { targetId: target.targetId }); }
      finally {
        browser.off('Target.receivedMessageFromTarget', receive);
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('Action target closed')); } pending.clear();
        await browser.detach();
      }
    },
  };
}
