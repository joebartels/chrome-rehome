import type { createConfigRepository } from '../config/repository';
import type { ConfigState } from '../config/schema';

type OptionsView = { heading: string; message: string; severity: 'info' | 'error' };
type TextElement = Pick<HTMLElement, 'textContent'>;
type Elements = { heading: TextElement; message: TextElement & Pick<HTMLElement, 'dataset'> };

export function createOptionsView(state: ConfigState): OptionsView {
  if (state.kind === 'ready') {
    return {
      heading: 'ChromeReHome installed',
      message: `Automatic placement is ${state.config.enabled ? 'enabled' : 'disabled'}. Tabs are never closed. Rule editing is not available yet.`,
      severity: 'info',
    };
  }
  const actions = {
    invalid: 'Stored configuration is invalid. Restore valid configuration using your configuration backup.',
    'future-version': 'Stored configuration requires a newer extension version. Update the extension to read it.',
    storage: 'Configuration storage is unavailable. Reload this page to try again.',
  };
  return { heading: 'ChromeReHome installed', message: `${actions[state.reason]} Automatic placement is unavailable. Tabs are never closed.`, severity: 'error' };
}

export function mountOptions(elements: Elements, config: ReturnType<typeof createConfigRepository>) {
  let disposed = false;
  let rendered = false;
  function render(state: ConfigState): void {
    if (disposed) return;
    rendered = true;
    const view = createOptionsView(state);
    elements.heading.textContent = view.heading;
    elements.message.textContent = view.message;
    elements.message.dataset.severity = view.severity;
  }
  const unsubscribe = config.subscribe(render);
  const ready = config.load().then((state) => { if (!rendered) render(state); });
  return {
    ready,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      config.dispose();
    },
  };
}
