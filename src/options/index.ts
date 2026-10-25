import { createChromeConfigStorage } from '../browser/config-storage';
import { createConfigRepository } from '../config/repository';
import { mountOptions } from './view';

const options = mountOptions({
  heading: document.getElementById('status-heading')!,
  message: document.getElementById('status-message')!,
}, createConfigRepository(createChromeConfigStorage(chrome)));

window.addEventListener('pagehide', () => { options.dispose(); }, { once: true });
