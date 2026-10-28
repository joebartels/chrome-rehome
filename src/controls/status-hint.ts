// This event carries no tab, configuration, journal or recovery data.
export function isStatusHint(value: unknown): boolean {
  return !!value && typeof value === 'object' && Reflect.ownKeys(value).length === 1 &&
    Object.hasOwn(value, 'kind') && (value as { kind: unknown }).kind === 'control-status-changed';
}
