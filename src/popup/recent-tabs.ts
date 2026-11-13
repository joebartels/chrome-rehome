import type { createRecentTabsBrowser, RecentTabRow } from '../browser/recent-tabs';

type Elements = {
  heading: HTMLElement;
  list: HTMLUListElement;
  status: HTMLElement;
  retry: HTMLButtonElement;
};

type RowElements = {
  item: HTMLLIElement;
  button: HTMLButtonElement;
  title: HTMLElement;
  details: HTMLElement;
  row: RecentTabRow;
};

const refreshDelayMs = 150;

export function mountRecentTabs(
  { heading, list, status, retry }: Elements,
  browser: ReturnType<typeof createRecentTabsBrowser>,
  close: () => void,
) {
  const document = list.ownerDocument;
  const rendered = new Map<number, RowElements>();
  let disposed = false;
  let reading = false;
  let dirty = false;
  let switching = false;
  let switchFailed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function render(rows: readonly RecentTabRow[]) {
    const active = document.activeElement;
    const focused = [...rendered.values()].find(entry => entry.button === active);
    const focusedIndex = focused ? [...list.children].indexOf(focused.item) : -1;
    const current = new Set(rows.map(row => row.id));
    for (const [id, entry] of rendered) {
      if (current.has(id)) continue;
      entry.item.remove();
      rendered.delete(id);
    }

    let cursor = list.firstElementChild;
    for (const row of rows) {
      let entry = rendered.get(row.id);
      if (!entry) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        const title = document.createElement('span');
        const details = document.createElement('span');
        button.type = 'button';
        button.dataset.recentTabId = String(row.id);
        title.className = 'recent-title';
        details.className = 'recent-details';
        entry = { item, button, title, details, row };
        const selected = entry;
        button.addEventListener('click', () => { void select(selected.row); });
        button.append(title, details);
        item.append(button);
        rendered.set(row.id, entry);
      }
      entry.row = row;
      entry.button.setAttribute('aria-label', row.title);
      entry.button.setAttribute('aria-description', [row.context, row.site].filter(Boolean).join(' · '));
      entry.title.textContent = row.title;
      entry.details.textContent = [row.context, row.site].filter(Boolean).join(' · ');
      if (entry.item !== cursor) list.insertBefore(entry.item, cursor);
      cursor = entry.item.nextElementSibling;
    }
    if (focused && document.activeElement !== focused.button) {
      const replacement = rows[Math.min(focusedIndex, rows.length - 1)];
      const next = rendered.get(focused.row.id) ?? (replacement && rendered.get(replacement.id));
      (next?.button ?? heading).focus();
    }
  }

  function schedule() {
    if (disposed) return;
    dirty = true;
    if (reading || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, refreshDelayMs);
  }

  async function refresh() {
    if (disposed || reading) return;
    dirty = false;
    reading = true;
    try {
      const rows = await browser.read();
      if (disposed) return;
      const retryFocused = document.activeElement === retry;
      render(rows);
      retry.hidden = true;
      status.textContent = switchFailed ? 'Could not switch to that tab.' : rows.length ? '' : 'No recent tabs yet.';
      if (retryFocused) (rendered.get(rows[0]?.id ?? -1)?.button ?? heading).focus();
    } catch {
      if (disposed) return;
      render([]);
      status.textContent = 'Could not load recent tabs.';
      retry.hidden = false;
    } finally {
      reading = false;
      if (dirty) schedule();
    }
  }

  async function select(row: RecentTabRow) {
    if (disposed || switching) return;
    switching = true;
    try {
      if (await browser.focus(row)) {
        if (!disposed) close();
        return;
      }
    } finally {
      switching = false;
    }
    if (disposed) return;
    switchFailed = true;
    status.textContent = 'Could not switch to that tab.';
    schedule();
  }

  function retryLoad() {
    switchFailed = false;
    schedule();
  }

  const detach = browser.subscribe(schedule);
  retry.addEventListener('click', retryLoad);
  void refresh();
  return {
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      retry.removeEventListener('click', retryLoad);
      detach();
    },
  };
}
