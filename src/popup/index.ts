import { createRecentTabsBrowser } from '../browser/recent-tabs';
import { createControlClient } from '../controls/client';
import { isStatusHint } from '../controls/status-hint';
import { createPopupController } from './controller';
import { mountRecentTabs } from './recent-tabs';
import { mountPopup } from './view';

const controller = createPopupController({
  client: createControlClient(chrome.runtime),
  async currentTarget() {
    const ownWindow = await chrome.windows.getCurrent();
    if (ownWindow.id === undefined) return;
    const tabs = await chrome.tabs.query({ active: true, windowId: ownWindow.id });
    const tab = tabs.length === 1 ? tabs[0] : undefined;
    if (tab?.id === undefined || tab.windowId !== ownWindow.id) return;
    return { tabId: tab.id, windowId: ownWindow.id, incognito: tab.incognito };
  },
  openSettings: () => chrome.runtime.openOptionsPage(),
  subscribe(refresh) {
    const message = (value: unknown, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && isStatusHint(value)) refresh();
    };
    // Selection changes are read-only UI invalidation, never worker authority changes.
    const changed = () => { refresh(); };
    chrome.runtime.onMessage.addListener(message);
    chrome.tabs.onActivated.addListener(changed);
    chrome.tabs.onUpdated.addListener(changed);
    chrome.tabs.onRemoved.addListener(changed);
    chrome.tabs.onReplaced.addListener(changed);
    return () => {
      chrome.runtime.onMessage.removeListener(message);
      chrome.tabs.onActivated.removeListener(changed);
      chrome.tabs.onUpdated.removeListener(changed);
      chrome.tabs.onRemoved.removeListener(changed);
      chrome.tabs.onReplaced.removeListener(changed);
    };
  },
});
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const popup = mountPopup({
  heading: element('status-heading'), description: element('status-description'), message: element('message'), targetMessage: element('target-message'),
  pause: element('pause'), resume: element('resume'), protect: element('protect'), refresh: element('refresh'), settings: element('settings'),
}, controller);
const recentTabs = mountRecentTabs({
  heading: element('recent-heading'), list: element('recent-list'), status: element('recent-status'), retry: element('recent-retry'),
}, createRecentTabsBrowser(chrome), () => window.close());
window.addEventListener('pagehide', () => { popup.dispose(); recentTabs.dispose(); }, { once: true });
void controller.refresh();
