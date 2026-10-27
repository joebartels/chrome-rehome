import type { createConfigRepository } from '../config/repository';
import type { Config, ConfigState } from '../config/schema';
import { createDraft, sameConfig, validateDraft, type DraftValidation, type EditorDraft } from './model';

type ReadonlyDraft = Readonly<Omit<EditorDraft, 'groupingRules' | 'duplicateRules'>> & {
  readonly groupingRules: readonly Readonly<EditorDraft['groupingRules'][number]>[];
  readonly duplicateRules: readonly Readonly<EditorDraft['duplicateRules'][number]>[];
};
export type EditorState = Readonly<{
  draft?: ReadonlyDraft;
  saved?: Readonly<ConfigState>;
  validation?: Readonly<DraftValidation>;
  dirty: boolean;
  busy: boolean;
  conflict: boolean;
  message: string;
}>;

export function createOptionsController(repository: ReturnType<typeof createConfigRepository>) {
  let base: Config | undefined;
  let draft: EditorDraft | undefined;
  let saved: ConfigState | undefined;
  let busy = false;
  let conflict = false;
  let unverified = false;
  let message = '';
  let disposed = false;
  let request = 0;
  let phase: 'load' | 'reload' | 'preflight' | 'write' | 'verify' | undefined = 'load';
  let candidate: Config | undefined;
  let operationBase: Config | undefined;
  let operationConflict = false;
  const listeners = new Set<(state: EditorState) => void>();

  function getState(): EditorState {
    const validation = draft ? validateDraft(draft) : undefined;
    const snapshot = draft ? Object.freeze({
      enabled: draft.enabled,
      groupingRules: Object.freeze(draft.groupingRules.map(rule => Object.freeze({ ...rule }))),
      duplicateRules: Object.freeze(draft.duplicateRules.map(rule => Object.freeze({ ...rule }))),
    }) : undefined;
    const readonlyValidation = validation?.kind === 'invalid'
      ? Object.freeze({ kind: 'invalid' as const, errors: Object.freeze(validation.errors.map(error => Object.freeze({ ...error }))) })
      : validation ? Object.freeze(validation) : undefined;
    return Object.freeze({ ...(snapshot ? { draft: snapshot } : {}), ...(saved ? { saved: Object.freeze({ ...saved }) } : {}),
      ...(readonlyValidation ? { validation: readonlyValidation } : {}),
      dirty: !!draft && (unverified || validation?.kind !== 'ready' || !base || !sameConfig(base, validation.config)),
      busy, conflict, message });
  }
  function emit(): void {
    if (disposed) return;
    const state = getState();
    for (const listener of listeners) listener(state);
  }
  function adopt(config: Config): void {
    base = config;
    draft = createDraft(config);
    conflict = false;
    unverified = false;
  }
  function observe(state: ConfigState): void {
    if (disposed) return;
    const wasDirty = getState().dirty;
    saved = state;
    if (phase === 'preflight' || phase === 'write' || phase === 'verify') {
      // A write can echo both its previous value and its pending candidate.
      // Neither publication is an instruction to discard the private draft.
      if (state.kind === 'ready') {
        const ownValue = !!operationBase && sameConfig(state.config, operationBase) ||
          phase !== 'preflight' && !!candidate && sameConfig(state.config, candidate);
        if (!ownValue) operationConflict = true;
      } else if (state.reason !== 'storage') operationConflict = true;
    } else if (phase !== 'reload') {
      if (state.kind === 'ready') {
        if (!wasDirty) adopt(state.config);
        else conflict = !base || !sameConfig(base, state.config);
      } else if (draft) conflict = true;
      if (conflict) message = 'Saved settings changed. Reload saved settings before saving your draft.';
    }
    emit();
  }
  const unsubscribe = repository.subscribe(observe);
  const initialRequest = ++request;
  const ready = repository.load().then(() => {
    if (disposed || request !== initialRequest) return;
    phase = undefined;
    const current = repository.getCurrent();
    if (current) observe(current.state);
  });

  async function reload(): Promise<void> {
    if (disposed || busy) return;
    const operation = ++request;
    busy = true;
    phase = 'reload';
    message = 'Loading saved settings…';
    emit();
    try {
      await repository.load();
      if (disposed || operation !== request) return;
      const current = repository.getCurrent();
      if (!current) {
        message = 'Saved settings are still changing. Your draft is unchanged. Try reloading again.';
        return;
      }
      saved = current.state;
      if (saved.kind === 'ready') {
        adopt(saved.config);
        message = 'Saved settings reloaded.';
      } else {
        conflict = !!draft;
        message = 'Could not reload saved settings. Your draft is unchanged. Try again.';
      }
    } finally {
      if (!disposed && operation === request) { busy = false; phase = undefined; emit(); }
    }
  }

  async function save(): Promise<void> {
    if (disposed || busy || !draft || !base || conflict) return;
    const validation = validateDraft(draft);
    if (validation.kind !== 'ready') { message = 'Fix the rule errors before saving.'; emit(); return; }
    const operation = ++request;
    const previousBase = base;
    operationBase = previousBase;
    candidate = validation.config;
    operationConflict = false;
    busy = true;
    phase = 'preflight';
    message = 'Checking saved settings…';
    emit();
    const active = () => !disposed && operation === request;
    function changed(): void {
      conflict = true;
      message = 'Saved settings changed. Your draft is unchanged. Reload saved settings before saving.';
    }
    try {
      await repository.load();
      if (!active()) return;
      const current = repository.getCurrent();
      if (!current) {
        message = 'Could not check the latest saved settings. Your draft is unchanged. Try saving again.';
        return;
      }
      saved = current.state;
      if (saved.kind !== 'ready') {
        if (saved.reason === 'storage') {
          message = 'Could not check saved settings. Your draft is unchanged. Try saving again.';
        } else changed();
        return;
      }
      if (operationConflict || !sameConfig(saved.config, previousBase)) { changed(); return; }
      phase = 'write';
      message = 'Saving settings…';
      emit();
      const written = await repository.save(candidate);
      if (!active()) return;
      if (written.kind !== 'ready') {
        conflict = operationConflict;
        message = operationConflict
          ? 'Could not save settings. Saved settings changed. Your draft is unchanged. Reload saved settings before saving.'
          : 'Could not save settings. Your draft is unchanged. Try saving again.';
        return;
      }
      // Writing succeeded even if the subsequent verification read fails.
      // Remember this baseline so a retry does not conflict with our own write.
      base = candidate;
      unverified = true;
      phase = 'verify';
      await repository.load();
      if (!active()) return;
      const verification = repository.getCurrent();
      if (!verification) {
        message = 'Settings were written, but current settings could not be verified. Try saving again.';
        return;
      }
      saved = verification.state;
      if (saved.kind === 'unavailable' && saved.reason === 'storage' && !operationConflict) {
        message = 'Settings were written, but current settings could not be verified. Try saving again.';
      } else if (operationConflict || saved.kind !== 'ready' || !sameConfig(saved.config, candidate)) changed();
      else { adopt(candidate); message = 'Settings saved.'; }
    } finally {
      if (active()) { busy = false; phase = undefined; candidate = undefined; operationBase = undefined; emit(); }
    }
  }

  return {
    ready, getState, save, reload,
    subscribe(listener: (state: EditorState) => void): () => void {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    edit(update: (value: EditorDraft) => void): void {
      if (disposed || busy || !draft || !base) return;
      // Do not expose the controller's mutable object to consumers.
      const next: EditorDraft = { enabled: draft.enabled,
        groupingRules: draft.groupingRules.map(rule => ({ ...rule })),
        duplicateRules: draft.duplicateRules.map(rule => ({ ...rule })) };
      update(next);
      next.enabled = base.enabled;
      draft = { enabled: next.enabled,
        groupingRules: next.groupingRules.map(rule => ({ ...rule })),
        duplicateRules: next.duplicateRules.map(rule => ({ ...rule })) };
      message = conflict ? 'Saved settings changed. Reload saved settings before saving your draft.' : 'Unsaved changes.';
      emit();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ++request;
      unsubscribe();
      listeners.clear();
      repository.dispose();
    },
  };
}
