import type { ProtectionStorage } from '../protections/repository';
const key = 'chromeReHomeProtections';
export function createChromeProtectionStorage(api: Pick<typeof chrome, 'storage'>): ProtectionStorage {
  return {
    async read() { return (await api.storage.session.get(key))[key]; },
    async write(value) { await api.storage.session.set({ [key]: value }); },
    subscribe(listener) {
      const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'session' && Object.hasOwn(changes, key)) listener(changes[key]!.newValue);
      };
      api.storage.onChanged.addListener(changed);
      return () => { api.storage.onChanged.removeListener(changed); };
    }
  };
}
