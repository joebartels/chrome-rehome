import { rm } from 'node:fs/promises';

type NativeResources = {
  helper?: { dispose(): Promise<void> } | undefined;
  context: { close(): Promise<void> } | undefined;
  servers: readonly ({
    closeAllConnections(): void;
    close(callback: (error?: Error) => void): unknown;
  } | undefined)[];
  launcher: { dispose(): Promise<void> } | undefined;
  profileRoot: string;
};

/** Release only this native trial's resources, after attempting browser shutdown. */
export async function cleanupExternalAppTrial(resources: NativeResources, testFailed: boolean) {
  const errors: unknown[] = [];
  const attempt = async (release: () => unknown) => {
    try { await release(); } catch (error) { errors.push(error); }
  };
  await attempt(() => resources.helper?.dispose());
  await attempt(() => resources.context?.close());
  for (const server of resources.servers) {
    if (!server) continue;
    await attempt(() => server.closeAllConnections());
    await attempt(() => new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())));
  }
  await attempt(() => resources.launcher?.dispose());
  await attempt(() => rm(resources.profileRoot, { recursive: true, force: true }));
  if (!testFailed && errors.length > 0) throw new AggregateError(errors, 'Native external trial cleanup failed');
}
