export type NavigationKind = 'committed' | 'history' | 'fragment';

export type NavigationInput = {
  tabId: number;
  frameId: number;
  url: string;
  timeStamp: number;
  documentId?: string;
  kind: NavigationKind;
};

export type Navigation = Readonly<{
  tabId: number;
  url: string;
  documentId?: string;
  kind: NavigationKind;
  observedSequence: number;
  generation: number;
  browserTimeStamp: number;
}>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createNavigationTracker() {
  const latest = new Map<number, Navigation>();
  let observedSequence = 0;
  // A tracker-wide counter prevents tokens from reviving after a tab ID is reused.
  let generation = 0;

  return {
    observe(input: NavigationInput): Navigation | undefined {
      if (input.frameId !== 0 || !Number.isSafeInteger(input.tabId) || input.tabId < 0) return;
      if (!Number.isFinite(input.timeStamp)) return;
      if (!isHttpUrl(input.url)) {
        latest.delete(input.tabId);
        return;
      }

      const previous = latest.get(input.tabId);
      if (previous?.kind === input.kind
        && previous.documentId === input.documentId
        && previous.url === input.url
        && previous.browserTimeStamp === input.timeStamp) return;

      const navigation: Navigation = Object.freeze({
        tabId: input.tabId,
        url: input.url,
        ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
        kind: input.kind,
        observedSequence: ++observedSequence,
        generation: ++generation,
        browserTimeStamp: input.timeStamp,
      });
      latest.set(input.tabId, navigation);
      return navigation;
    },
    invalidate(tabId: number): void {
      latest.delete(tabId);
    },
    forget(tabId: number): void {
      latest.delete(tabId);
    },
    isCurrent(event: Navigation): boolean {
      return latest.get(event.tabId)?.generation === event.generation;
    },
  };
}
