import { createControlClient } from '../controls/client';
import { createChromeConfigStorage } from '../browser/config-storage';
import { createConfigRepository } from '../config/repository';
import { mountOptions } from './view';

const client = createControlClient(chrome.runtime);
const storage = createChromeConfigStorage(chrome);
const repository = createConfigRepository({ read: storage.read, subscribe: storage.subscribe,
  async write() { throw new Error('Options writes require the worker.'); } });

const options = mountOptions({
  heading: document.getElementById('status-heading')!,
  message: document.getElementById('status-message')!,
  ...(document.getElementById('editor') ? { editor: document.getElementById('editor')! } : {}),
}, repository, async (baseRules, rules) => {
  const status = await client.getStatus();
  const result = await client.saveRules(status.status.version, baseRules, rules);
  return result.kind === 'invalid' ? 'unavailable' : result.kind;
});

window.addEventListener('pagehide', () => { options.dispose(); }, { once: true });
