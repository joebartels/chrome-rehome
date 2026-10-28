import type { ControlReply } from '../controls/protocol';

type Runtime = Pick<typeof chrome.runtime, 'id' | 'getURL' | 'onMessage'>;
export function registerControlMessages(runtime: Runtime, service: { handle(raw: unknown): Promise<ControlReply> }): () => void {
  const allowed = new Set(['options/index.html', 'popup/index.html'].map(path => runtime.getURL(path)));
  const listener = (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (reply: ControlReply) => void) => {
    if (sender.id !== runtime.id || !sender.url || !allowed.has(sender.url) || sender.frameId !== undefined && sender.frameId !== 0) return false;
    void service.handle(message).then(sendResponse);
    // Promise-only onMessage listeners are not supported by Chrome 120.
    return true;
  };
  runtime.onMessage.addListener(listener);
  return () => { runtime.onMessage.removeListener(listener); };
}
