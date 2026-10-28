import type { createPopupController, PopupState } from './controller';

export function createPopupView(state: PopupState) {
  const phase = state.status?.phase ?? (state.connection === 'unavailable' ? 'unavailable' : 'checking');
  const pauseDisabled = state.busy || !state.status;
  const ready = phase === 'active' || phase === 'paused';
  const copy = {
    checking: ['Checking processing status', 'Readiness is being checked. Saved settings alone do not confirm processing.'],
    active: ['Active', 'Automatic grouping and duplicate closure are active.'],
    paused: ['Paused', 'Automatic grouping and duplicate closure are paused. Resume applies only to future eligible navigation.'],
    unavailable: ['Processing unavailable', state.status
      ? 'Configuration or protection readiness could not be verified. Explicit Pause may safely verify a paused configuration. Refresh only reads current status.'
      : 'Could not connect to processing status. Refresh to reconnect.'],
    blocked: ['Recovery blocked', 'An interrupted operation prevents processing. Pause cannot clear recovery. Chrome restart may reconcile settled work; uncertain operations stay blocked.'],
  }[phase]!;
  const automatic = [state.target?.pinned ? 'Pinned tab exclusion applies.' : '', state.target?.audible ? 'Audio exclusion applies while this tab is audible.' : ''].filter(Boolean).join(' ');
  return {
    heading: state.busy ? 'Applying change…' : copy[0]!,
    description: state.busy ? 'Verifying the requested change. Already issued browser actions may finish.' : copy[1]!,
    message: state.message,
    pauseDisabled,
    resumeDisabled: state.busy || phase !== 'paused',
    protectionDisabled: state.busy || !ready || !state.target,
    protected: state.target?.protected ?? false,
    targetMessage: state.target ? [state.target.protected ? 'Manual protection is on.' : 'Manual protection is off.', automatic].filter(Boolean).join(' ')
      : state.targetChecking ? 'Checking the selected tab…' : 'Protection is unavailable for this selected document.' + (pauseDisabled ? '' : ' Global Pause remains available.'),
    severity: phase === 'unavailable' || phase === 'blocked' ? 'error' : 'info',
  };
}
type Elements = {
  heading: HTMLElement; description: HTMLElement; message: HTMLElement; targetMessage: HTMLElement;
  pause: HTMLButtonElement; resume: HTMLButtonElement; protect: HTMLInputElement;
  refresh: HTMLButtonElement; settings: HTMLButtonElement;
};
type Controller = Pick<ReturnType<typeof createPopupController>, 'subscribe'|'setEnabled'|'protect'|'refresh'|'openSettings'|'dispose'>;
export function mountPopup(elements: Elements, controller: Controller) {
  const detach = controller.subscribe(state => {
    const view = createPopupView(state);
    elements.heading.textContent = view.heading;
    elements.description.textContent = view.description;
    elements.message.textContent = view.message;
    elements.message.dataset.severity = view.severity;
    elements.targetMessage.textContent = view.targetMessage;
    elements.pause.disabled = view.pauseDisabled;
    elements.resume.disabled = view.resumeDisabled;
    elements.protect.disabled = view.protectionDisabled;
    elements.protect.checked = view.protected;
    elements.protect.setAttribute('aria-busy', String(state.targetChecking || state.busy));
  });
  const bindings: [HTMLElement, string, () => void][] = [
    [elements.pause, 'click', () => { void controller.setEnabled(false); }],
    [elements.resume, 'click', () => { void controller.setEnabled(true); }],
    [elements.protect, 'change', () => { void controller.protect(elements.protect.checked); }],
    [elements.refresh, 'click', () => { void controller.refresh(); }],
    [elements.settings, 'click', () => { void controller.openSettings(); }],
  ];
  for (const [element, name, listener] of bindings) element.addEventListener(name, listener);
  return { dispose() { detach(); for (const [element, name, listener] of bindings) element.removeEventListener(name, listener); controller.dispose(); } };
}
