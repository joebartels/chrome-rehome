import type { ConfigStorage } from '../config/repository';

const configKey = 'chromeReHomeConfig';

export function createChromeConfigStorage(api: Pick<typeof chrome, 'storage'>): ConfigStorage {
  return {
    async read() {
      const values = await api.storage.local.get(configKey);
      return values[configKey];
    },
    async write(value) {
      await api.storage.local.set({ [configKey]: value });
    },
    subscribe(listener) {
      const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local' && Object.hasOwn(changes, configKey)) listener();
      };
      api.storage.onChanged.addListener(onChanged);
      return () => { api.storage.onChanged.removeListener(onChanged); };
    },
  };
}
