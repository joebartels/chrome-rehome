export type PresentationState = Readonly<{
  focusedWindowId: number | null;
  activeTabs: readonly Readonly<{windowId: number; tabId: number}>[];
}>;
export type PresentationIntent = Readonly<{kind: 'preserve'}>
  | Readonly<{kind: 'foreground'; sourceWindowId: number; initial: PresentationState}>;

export function coherentPresentation(state: PresentationState | undefined): state is PresentationState {
  if (!state || !Array.isArray(state.activeTabs)) return false;
  const windows = new Set<number>();
  const tabs = new Set<number>();
  for (const entry of state.activeTabs) {
    if (!Number.isSafeInteger(entry.windowId) || entry.windowId < 0 || windows.has(entry.windowId)
      || !Number.isSafeInteger(entry.tabId) || entry.tabId < 0 || tabs.has(entry.tabId)) return false;
    windows.add(entry.windowId); tabs.add(entry.tabId);
  }
  return state.focusedWindowId === null || windows.has(state.focusedWindowId);
}
export function copyPresentation(state: PresentationState): PresentationState {
  return Object.freeze({focusedWindowId:state.focusedWindowId,
    activeTabs:Object.freeze(state.activeTabs.map(entry=>Object.freeze({...entry})))});
}
export function planPresentation(tabId: number, sourceWindowId: number, initiallyActive: boolean | undefined,
  state: PresentationState | undefined): PresentationIntent {
  if (initiallyActive !== true || !coherentPresentation(state) || state.focusedWindowId !== sourceWindowId
    || !state.activeTabs.some(entry=>entry.windowId === sourceWindowId && entry.tabId === tabId))
    return Object.freeze({kind:'preserve'});
  return Object.freeze({kind:'foreground',sourceWindowId,initial:copyPresentation(state)});
}
