import type { JournalStorage } from '../execution/journal';
export const JOURNAL_KEY = 'chromeReHomeReplacementJournal';
export function createChromeJournalStorage(api: Pick<typeof chrome, 'storage'>): JournalStorage {
  return {
    async read() { return (await api.storage.session.get(JOURNAL_KEY))[JOURNAL_KEY]; },
    async write(value) { await api.storage.session.set({ [JOURNAL_KEY]: value }); },
    async clear() { await api.storage.session.remove(JOURNAL_KEY); }
  };
}
