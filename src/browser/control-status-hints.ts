export function createStatusNotifier(runtime: { sendMessage(message: { kind: 'control-status-changed' }): Promise<unknown> }) {
  return () => {
    // A closed popup is normal. This read-only hint never holds the worker alive or retries.
    void runtime.sendMessage({ kind: 'control-status-changed' }).catch(() => {});
  };
}
