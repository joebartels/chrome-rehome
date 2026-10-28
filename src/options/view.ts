import type { createConfigRepository } from '../config/repository';
import type { ConfigState } from '../config/schema';
import { createOptionsController, type EditorState, type RulesWriter } from './controller';
import { previewDraft, type EditorDraft, type DuplicatePreview } from './model';
import { createRuleRow, type RuleList } from './rows';

type OptionsView = { heading: string; message: string; severity: 'info' | 'error' };
type TextElement = Pick<HTMLElement, 'textContent'>;
type Elements = { heading: TextElement; message: TextElement & Pick<HTMLElement, 'dataset'>; editor?: HTMLElement };

export function createOptionsView(state: ConfigState): OptionsView {
  if (state.kind === 'ready') {
    return {
      heading: 'ChromeReHome installed',
      message: state.config.enabled
        ? 'Automatic replacement is enabled. Older duplicate tabs may close after verified placement. Interrupted operations may pause processing until Chrome restarts.'
        : 'Automatic replacement is disabled.',
      severity: 'info',
    };
  }
  const actions = {
    invalid: 'Stored configuration is invalid. Restore valid configuration using your configuration backup.',
    'future-version': 'Stored configuration requires a newer extension version. Update the extension to read it.',
    storage: 'Configuration storage is unavailable. Reload this page to try again.',
  };
  return { heading: 'ChromeReHome installed', message: `${actions[state.reason]} Automatic replacement is unavailable.`, severity: 'error' };
}

export function mountOptions(elements: Elements, config: ReturnType<typeof createConfigRepository>, writeRules?: RulesWriter) {
  const controller = createOptionsController(config, writeRules);
  const editor = elements.editor ? createEditorView(elements.editor, controller) : undefined;
  function render(state: EditorState): void {
    if (!state.saved) return;
    const view = createOptionsView(state.saved);
    elements.heading.textContent = view.heading;
    elements.message.textContent = view.message;
    elements.message.dataset.severity = view.severity;
  }
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  return {
    ready: controller.ready,
    dispose(): void {
      unsubscribe();
      editor?.dispose();
      controller.dispose();
    },
  };
}

function createEditorView(root: HTMLElement, controller: ReturnType<typeof createOptionsController>) {
  function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, parent: HTMLElement, id?: string) {
    const element = document.createElement(tag); element.textContent = value;
    if (id) element.id = id;
    parent.append(element); return element;
  }
  const toolbar = document.createElement('div'); toolbar.className = 'toolbar'; root.append(toolbar);
  const save = text('button', 'Save settings', toolbar); save.type = 'button'; save.className = 'primary';
  const reload = text('button', 'Reload saved settings', toolbar); reload.type = 'button';
  const draftState = text('p', '', root, 'draft-state');
  const actionMessage = text('p', '', root, 'editor-message'); actionMessage.setAttribute('aria-live', 'polite');
  const form = document.createElement('div'); root.append(form);
  text('p', 'Save writes all rules together and preserves the saved activation setting. Preview evaluates your draft even when automatic replacement is disabled.', form);
  let nextId = 0;
  type Row = ReturnType<typeof createRuleRow>;
  const lists = new Map<RuleList, { rows: Row[]; container: HTMLElement; add: HTMLButtonElement; error: HTMLElement }>();

  function rowFor(list: RuleList): Row {
    const id = ++nextId;
    return createRuleRow(list, id, (key, value) => {
      controller.edit(draft => {
        const index = lists.get(list)!.rows.findIndex(row => row.id === id);
        const rule = draft[list][index];
        if (rule) Object.assign(rule, { [key]: value });
      });
    }, action => {
      if (controller.getState().busy) return;
      const group = lists.get(list)!;
      const index = group.rows.findIndex(row => row.id === id);
      const target = action === 'up' ? index - 1 : index + 1;
      if (action === 'delete') {
        const [removed] = group.rows.splice(index, 1); removed?.node.remove();
        controller.edit(draft => { draft[list].splice(index, 1); });
        const nearest = group.rows[Math.min(index, group.rows.length - 1)];
        if (nearest) nearest.focus(); else group.add.focus();
      } else if (target >= 0 && target < group.rows.length) {
        const [row] = group.rows.splice(index, 1); group.rows.splice(target, 0, row!);
        controller.edit(draft => {
          const values = draft[list] as (EditorDraft[RuleList][number])[];
          const [rule] = values.splice(index, 1); values.splice(target, 0, rule!);
        });
        row!.focus(action);
      }
    });
  }
  for (const [list, heading, description, addTitle] of [
    ['groupingRules', 'Grouping rules', 'Grouping rules apply when no duplicate tab is already open. An existing duplicate keeps its group and window. Otherwise, the first enabled matching rule chooses the group title and reuses an existing group across windows. Foreground opens follow the tab to its destination; background opens stay in the background. Use an HTTP(S) URL or *:// for either scheme, with * wildcards in the hostname or path. Other pattern syntax is literal. Query and fragment are ignored when matching; do not include ? or # in a pattern. Up to 100 rules.', 'Add grouping rule'],
    ['duplicateRules', 'Duplicate policies', 'Optional: decide when slightly different URLs count as the same page. Leave empty for strict comparison. For example, origin https://example.com with ignored name utm_source treats links differing only by that tracking value as duplicates. Each origin has one policy; order has no precedence. Disabling a policy restores strict comparison. Up to 100 rules.', 'Add duplicate rule'],
  ] as const) {
    const section = document.createElement('section'); form.append(section);
    text('h2', heading, section); text('p', description, section);
    const error = text('p', '', section); error.className = 'error';
    const container = document.createElement('div'); section.append(container);
    const add = text('button', addTitle, section); add.type = 'button';
    lists.set(list, { rows: [], container, add, error });
    add.addEventListener('click', () => {
      if (controller.getState().busy || (controller.getState().draft?.[list].length ?? 100) >= 100) return;
      controller.edit(draft => {
        if (list === 'groupingRules') draft.groupingRules.push({ enabled: true, pattern: '', group: '' });
        else draft.duplicateRules.push({ enabled: true, origin: '', ignoredQueryNames: '', ignoreFragment: false, ignoreTrailingSlash: false, sortQueryParameters: false });
      });
      lists.get(list)!.rows.at(-1)?.focus();
    });
  }
  const preview = document.createElement('section'); form.append(preview);
  text('h2', 'Matching preview', preview);
  text('p', 'Paste a URL to test which grouping rule matches. Add a second URL to check whether both count as duplicates. Preview uses your draft without changing tabs or saved settings. During real navigation, an existing duplicate keeps its group and window ahead of the rule shown here. Without a duplicate, a matching named group can be reused across windows. Foreground opens follow the destination; background opens preserve your current selection. Duplicate comparison assumes the same normal browsing context.', preview);
  function previewInput(title: string, id: string) {
    const label = document.createElement('label'); label.className = 'field'; label.htmlFor = id;
    text('span', title, label);
    const input = document.createElement('input'); input.id = id; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    label.append(input); preview.append(label); return input;
  }
  const url = previewInput('URL to preview', 'preview-url');
  const compare = previewInput('Compare with URL', 'preview-compare-url');
  const results = document.createElement('div'); results.className = 'preview-results'; results.setAttribute('aria-live', 'polite'); preview.append(results);
  const grouping = text('p', '', results, 'preview-grouping');
  const left = text('p', '', results, 'preview-duplicate-left');
  const right = text('p', '', results, 'preview-duplicate-right');
  const comparison = text('p', '', results, 'preview-comparison');
  function describeDuplicate(value: DuplicatePreview): string {
    switch (value.kind) {
      case 'policy': return `Duplicate rule ${value.ruleIndex + 1}: ${value.origin}`;
      case 'conservative': return 'Conservative duplicate comparison';
      case 'empty': return 'Enter a URL for duplicate comparison';
      case 'invalid': return 'Invalid or unsupported duplicate URL';
    }
  }
  function renderPreview(state: EditorState): void {
    if (!state.draft) return;
    const result = previewDraft({ enabled: state.draft.enabled,
      groupingRules: state.draft.groupingRules.map(rule => ({ ...rule })),
      duplicateRules: state.draft.duplicateRules.map(rule => ({ ...rule })) }, url.value, compare.value);
    if (result.kind === 'invalid') {
      grouping.textContent = 'Fix rule errors to preview.';
      left.textContent = ''; right.textContent = ''; comparison.textContent = ''; return;
    }
    grouping.textContent = result.grouping.kind === 'matched' ? `Grouping rule ${result.grouping.ruleIndex + 1}: ${result.grouping.group}`
      : result.grouping.kind === 'empty' ? 'Enter a URL to preview grouping'
      : result.grouping.kind === 'invalid' ? 'Invalid or unsupported URL' : 'No grouping rule matches';
    left.textContent = describeDuplicate(result.duplicate.left);
    right.textContent = describeDuplicate(result.duplicate.right);
    comparison.textContent = result.comparison.kind === 'equivalent' ? 'Equivalent duplicate URLs'
      : result.comparison.kind === 'distinct' ? 'Distinct URLs'
      : result.comparison.kind === 'invalid' ? 'Invalid or unsupported comparison URL' : 'Enter both URLs to compare';
  }
  function render(state: EditorState): void {
    form.hidden = !state.draft;
    save.disabled = state.busy || !state.draft || state.validation?.kind !== 'ready' || state.conflict;
    reload.disabled = state.busy;
    draftState.textContent = state.busy ? 'Working…' : state.conflict ? 'Draft conflicts with saved settings.' : state.dirty ? 'Draft has unsaved changes.' : state.draft ? 'Draft matches saved settings.' : 'Load valid saved settings to edit rules.';
    actionMessage.textContent = state.message;
    actionMessage.dataset.severity = state.conflict ? 'error' : 'info';
    for (const [list, group] of lists) {
      const rules = state.draft?.[list] ?? [];
      while (group.rows.length > rules.length) group.rows.pop()!.node.remove();
      while (group.rows.length < rules.length) group.rows.push(rowFor(list));
      group.rows.forEach((row, index) => {
        // Reordering alone moves nodes; typing keeps focused inputs attached.
        if (group.container.children[index] !== row.node) group.container.insertBefore(row.node, group.container.children[index] ?? null);
        row.update(rules[index]!, index, rules.length, state.busy,
          state.validation?.kind === 'invalid' ? state.validation.errors.filter(error => error.list === list && error.ruleIndex === index).map(error => error.message) : []);
      });
      group.error.textContent = state.validation?.kind === 'invalid' ? state.validation.errors.filter(error => error.list === list && error.ruleIndex === undefined).map(error => error.message).join(' ') : '';
      group.error.hidden = group.error.textContent === '';
      group.add.disabled = state.busy || !state.draft || rules.length >= 100;
    }
    renderPreview(state);
  }
  const onPreview = () => { renderPreview(controller.getState()); };
  url.addEventListener('input', onPreview); compare.addEventListener('input', onPreview);
  save.addEventListener('click', () => { void controller.save(); });
  reload.addEventListener('click', () => { void controller.reload(); });
  const unsubscribe = controller.subscribe(render);
  render(controller.getState());
  return { dispose(): void { unsubscribe(); root.replaceChildren(); } };
}
