import type { createCoordinator } from './coordinator';
import type { NavigationInput, NavigationKind } from './navigation';

type EventsApi = {
  webNavigation: Pick<typeof chrome.webNavigation,
    'onCommitted' | 'onHistoryStateUpdated' | 'onReferenceFragmentUpdated' | 'onBeforeNavigate'>;
  tabs: Pick<typeof chrome.tabs, 'onRemoved' | 'onReplaced'>;
  runtime: Pick<typeof chrome.runtime, 'onStartup' | 'onInstalled'>;
};

export function registerEvents(
  api: EventsApi,
  coordinator: ReturnType<typeof createCoordinator>,
  reportFailure: () => void,
): void {
  async function safely(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch {
      reportFailure();
    }
  }
  function navigation(kind: NavigationKind) {
    return (details: Omit<NavigationInput, 'kind'>) => safely(() => coordinator.handle({
      tabId: details.tabId,
      frameId: details.frameId,
      url: details.url,
      timeStamp: details.timeStamp,
      ...(details.documentId === undefined ? {} : { documentId: details.documentId }),
      kind,
    }));
  }

  api.webNavigation.onCommitted.addListener(navigation('committed'));
  api.webNavigation.onHistoryStateUpdated.addListener(navigation('history'));
  api.webNavigation.onReferenceFragmentUpdated.addListener(navigation('fragment'));
  api.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) coordinator.invalidate(details.tabId);
  });
  api.tabs.onRemoved.addListener((tabId) => { coordinator.forget(tabId); });
  api.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    coordinator.forget(removedTabId);
    coordinator.invalidate(addedTabId);
  });
  api.runtime.onStartup.addListener(() => safely(() => coordinator.initialize()));
  api.runtime.onInstalled.addListener(() => safely(() => coordinator.initialize()));
}
