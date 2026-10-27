import type { EditorDraft } from './model';

export type RuleList = 'groupingRules' | 'duplicateRules';
type Rule = EditorDraft[RuleList][number];
type Action = 'up' | 'down' | 'delete';

export function createRuleRow(list: RuleList, id: number,
  edit: (key: string, value: string | boolean) => void, act: (action: Action) => void) {
  const kind = list === 'groupingRules' ? 'Grouping' : 'Duplicate';
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'rule';
  const legend = document.createElement('legend'); fieldset.append(legend);
  const error = document.createElement('p'); error.className = 'error';
  error.id = `${kind.toLowerCase()}-${id}-error`;
  const fields = new Map<string, { control: HTMLInputElement | HTMLTextAreaElement; label: HTMLSpanElement; title: string }>();
  function field(key: string, title: string, type: 'text' | 'checkbox' | 'textarea', limit?: number) {
    const label = document.createElement('label');
    label.className = type === 'checkbox' ? 'check' : 'field';
    const text = document.createElement('span');
    const control = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    control.id = `${kind.toLowerCase()}-${id}-${key}`;
    text.id = `${control.id}-label`;
    label.htmlFor = control.id;
    control.setAttribute('aria-labelledby', text.id);
    if (control instanceof HTMLInputElement) control.type = type;
    if (limit !== undefined) control.maxLength = limit;
    control.autocomplete = 'off'; control.spellcheck = false;
    if (type !== 'checkbox') control.required = key !== 'ignoredQueryNames';
    if (type === 'textarea') {
      const hint = document.createElement('small');
      hint.id = `${control.id}-hint`;
      hint.textContent = 'One exact decoded name per line; up to 100 distinct names, 256 characters each. Leave empty for none. Spaces are preserved.';
      label.append(text, control, hint);
      control.setAttribute('aria-describedby', `${hint.id} ${error.id}`);
    } else {
      label.append(...(type === 'checkbox' ? [control, text] : [text, control]));
      control.setAttribute('aria-describedby', error.id);
    }
    control.addEventListener(type === 'checkbox' ? 'change' : 'input', () => {
      edit(key, control instanceof HTMLInputElement && type === 'checkbox' ? control.checked : control.value);
    });
    fields.set(key, { control, label: text, title });
    fieldset.append(label);
  }
  field('enabled', 'enabled', 'checkbox');
  if (list === 'groupingRules') {
    field('pattern', 'pattern', 'text', 2048);
    field('group', 'group name', 'text', 80);
  } else {
    field('origin', 'origin', 'text', 2048);
    field('ignoredQueryNames', 'ignored query names', 'textarea', 25699);
    field('ignoreFragment', 'ignore fragment', 'checkbox');
    field('ignoreTrailingSlash', 'ignore trailing slash', 'checkbox');
    field('sortQueryParameters', 'sort query parameters', 'checkbox');
  }
  fieldset.append(error);
  const actions = document.createElement('div'); actions.className = 'row-actions';
  const buttons = new Map<Action, HTMLButtonElement>();
  for (const [action, title] of [['up', 'Move up'], ['down', 'Move down'], ['delete', 'Delete']] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = title;
    button.addEventListener('click', () => { act(action); }); buttons.set(action, button); actions.append(button);
  }
  fieldset.append(actions);
  return {
    id, node: fieldset,
    update(rule: Readonly<Rule>, index: number, count: number, busy: boolean, errors: readonly string[]): void {
      const prefix = `${kind} rule ${index + 1}`;
      legend.textContent = prefix;
      const values = rule as unknown as Record<string, string | boolean>;
      for (const [key, { control, label, title }] of fields) {
        label.textContent = `${prefix} ${title}`;
        if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = values[key] === true;
        else if (control.value !== values[key]) control.value = String(values[key]);
        control.setAttribute('aria-invalid', String(errors.length > 0));
      }
      fieldset.disabled = busy;
      error.textContent = errors.join(' '); error.hidden = errors.length === 0;
      for (const [action, button] of buttons) {
        button.setAttribute('aria-label', action === 'delete' ? `Delete ${prefix.toLowerCase()}` : `Move ${prefix.toLowerCase()} ${action}`);
        button.disabled = busy || action === 'up' && index === 0 || action === 'down' && index === count - 1;
      }
    },
    focus(action?: Action): void {
      if (action && !buttons.get(action)?.disabled) buttons.get(action)!.focus();
      else if (action && !buttons.get('down')!.disabled) buttons.get('down')!.focus();
      else if (action && !buttons.get('up')!.disabled) buttons.get('up')!.focus();
      else fields.get(list === 'groupingRules' ? 'pattern' : 'origin')!.control.focus();
    },
  };
}
