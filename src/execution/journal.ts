export type JournalMutation = 'ungroup' | 'move' | 'group' | 'title' | 'remove';
export type JournalParticipant = Readonly<{ tabId: number; incognito: boolean; documentId?: string }>;
export type ReplacementJournal = Readonly<{
  version: 1;
  operationId: string;
  participants: readonly JournalParticipant[];
  completedPhase: 'prepared' | 'ungroup' | 'move' | 'group' | 'title' | 'placed' | 'removed' | 'completed';
  sequence: number;
  pending: null | Readonly<{ sequence: number; kind: JournalMutation; tabId: number }>;
  removedTabIds: readonly number[];
  terminal: null | 'completed' | 'abandoned';
}>;
export type JournalRead = Readonly<{ kind: 'empty' }> | Readonly<{ kind: 'valid'; value: ReplacementJournal }> | Readonly<{ kind: 'invalid' }>;
export type JournalStorage = {
  read(): Promise<unknown>;
  write(value: ReplacementJournal): Promise<void>;
  clear(): Promise<void>;
};
const mutations: readonly string[] = ['ungroup', 'move', 'group', 'title', 'remove'];
const phases: readonly string[] = ['prepared', 'ungroup', 'move', 'group', 'title', 'placed', 'removed', 'completed'];
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const actual = Reflect.ownKeys(value);
  return required.every(key => Object.hasOwn(value, key))
    && actual.every(key => typeof key === 'string' && (required.includes(key) || optional.includes(key)));
}
function dense(value: unknown, maximum: number): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum
    && Reflect.ownKeys(value).length === value.length + 1
    && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean);
}
function id(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function string(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }

// Parsing makes a detached receipt. Neither browser metadata nor storage-owned objects can mutate it.
export function parseJournal(raw: unknown): JournalRead {
  if (raw === undefined) return Object.freeze({ kind: 'empty' });
  const invalid = Object.freeze({ kind: 'invalid' } as const);
  try {
    const serialized = JSON.stringify(raw);
    if (serialized === undefined || serialized.length > 65536) return invalid;
    if (!object(raw) || !keys(raw, ['version', 'operationId', 'participants', 'completedPhase', 'sequence', 'pending', 'removedTabIds', 'terminal'])
      || raw.version !== 1 || !string(raw.operationId) || !dense(raw.participants, 100) || !raw.participants.length
      || !dense(raw.removedTabIds, 99) || !id(raw.sequence) || raw.sequence > 105
      || typeof raw.completedPhase !== 'string' || !phases.includes(raw.completedPhase)
      || raw.terminal !== null && raw.terminal !== 'completed' && raw.terminal !== 'abandoned') return invalid;
    const participants: JournalParticipant[] = [];
    const ids = new Set<number>();
    for (const participant of raw.participants) {
      if (!object(participant) || !keys(participant, ['tabId', 'incognito'], ['documentId'])
        || !id(participant.tabId) || ids.has(participant.tabId) || typeof participant.incognito !== 'boolean'
        || Object.hasOwn(participant, 'documentId') && !string(participant.documentId)
        || participants.length === 0 && !string(participant.documentId)
        || participants.length > 0 && participant.incognito !== participants[0]!.incognito) return invalid;
      ids.add(participant.tabId);
      participants.push(Object.freeze({ tabId: participant.tabId, incognito: participant.incognito,
        ...(participant.documentId === undefined ? {} : { documentId: participant.documentId as string }) }));
    }
    const removed: number[] = [];
    for (const [index, tabId] of raw.removedTabIds.entries()) {
      if (!id(tabId) || tabId !== participants[index + 1]?.tabId) return invalid;
      removed.push(tabId);
    }
    if (removed.length > raw.sequence || removed.length > 0 && !['removed', 'completed'].includes(raw.completedPhase)
      || raw.completedPhase === 'removed' && removed.length === 0
      || raw.completedPhase === 'completed' && raw.terminal !== 'completed'
      || raw.terminal === 'completed' && raw.completedPhase !== 'completed'
      || mutations.includes(raw.completedPhase) && raw.sequence === 0) return invalid;
    let pending: ReplacementJournal['pending'] = null;
    if (raw.pending !== null) {
      const entry = raw.pending;
      if (!object(entry) || !keys(entry, ['sequence', 'kind', 'tabId']) || raw.terminal !== null
        || !id(entry.sequence) || entry.sequence === 0 || entry.sequence !== raw.sequence
        || typeof entry.kind !== 'string' || !mutations.includes(entry.kind) || !id(entry.tabId)) return invalid;
      if (entry.kind === 'remove') {
        if (!['placed', 'removed'].includes(raw.completedPhase) || entry.sequence <= removed.length
          || entry.tabId !== participants[removed.length + 1]?.tabId) return invalid;
      } else if (entry.tabId !== participants[0]!.tabId || ['placed', 'removed', 'completed'].includes(raw.completedPhase)) return invalid;
      pending = Object.freeze({ sequence: entry.sequence, kind: entry.kind as JournalMutation, tabId: entry.tabId });
    }
    return Object.freeze({ kind: 'valid', value: Object.freeze({ version: 1, operationId: raw.operationId,
      participants: Object.freeze(participants), completedPhase: raw.completedPhase as ReplacementJournal['completedPhase'],
      sequence: raw.sequence, pending, removedTabIds: Object.freeze(removed), terminal: raw.terminal as ReplacementJournal['terminal'] }) });
  } catch { return invalid; }
}

export function createReplacementJournal({ storage, createOperationId }: { storage: JournalStorage; createOperationId(): string }) {
  let blocked = false;
  let current: ReplacementJournal | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = tail.then(() => {
      if (blocked) throw new Error('Replacement journal is blocked.');
      return operation();
    });
    tail = next.catch(() => {});
    return next;
  }
  async function read(): Promise<JournalRead> {
    try {
      const value = parseJournal(await storage.read());
      if (value.kind === 'invalid') blocked = true;
      current = value.kind === 'valid' ? value.value : undefined;
      return value;
    } catch {
      blocked = true;
      return Object.freeze({ kind: 'invalid' });
    }
  }
  async function write(next: ReplacementJournal): Promise<void> {
    const parsed = parseJournal(next);
    if (parsed.kind !== 'valid') throw new Error('Invalid replacement journal transition.');
    try { await storage.write(parsed.value); }
    catch (cause) { blocked = true; throw cause; }
    current = parsed.value;
  }
  function active(): ReplacementJournal {
    if (!current || current.terminal) throw new Error('No active replacement journal.');
    return current;
  }
  return {
    load(): Promise<JournalRead> { return serial(read); },
    begin(participants: readonly JournalParticipant[]): Promise<void> {
      return serial(async () => {
        const previous = await read();
        if (previous.kind !== 'empty') {
          blocked = true;
          throw new Error('Replacement journal is occupied.');
        }
        await write({ version: 1, operationId: createOperationId(), participants, completedPhase: 'prepared', sequence: 0,
          pending: null, removedTabIds: [], terminal: null });
      });
    },
    beforeMutation(kind: JournalMutation, tabId: number): Promise<void> {
      return serial(async () => {
        const value = active();
        if (value.pending) throw new Error('Native mutation is already pending.');
        const sequence = value.sequence + 1;
        await write({ ...value, sequence, pending: { sequence, kind, tabId } });
      });
    },
    settled(): Promise<void> {
      return serial(async () => {
        const value = active();
        if (value.pending) await write({ ...value, pending: null });
      });
    },
    verified(phase: ReplacementJournal['completedPhase'], removedTabId?: number): Promise<void> {
      return serial(async () => {
        const value = active();
        if (value.pending) throw new Error('Cannot verify a pending mutation.');
        await write({ ...value, completedPhase: phase, removedTabIds: removedTabId === undefined
          ? value.removedTabIds : [...value.removedTabIds, removedTabId] });
      });
    },
    finish(outcome: 'completed' | 'abandoned'): Promise<void> {
      return serial(async () => {
        const value = active();
        if (value.pending) throw new Error('Cannot finish a pending mutation.');
        await write({ ...value, terminal: outcome, ...(outcome === 'completed' ? { completedPhase: 'completed' as const } : {}) });
      });
    },
    clear(): Promise<void> {
      return serial(async () => {
        if (current?.pending) throw new Error('Cannot clear a pending mutation.');
        try { await storage.clear(); }
        catch (cause) { blocked = true; throw cause; }
        current = undefined;
      });
    },
    isBlocked(): boolean { return blocked; }
  };
}
