import { expect, test } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupExternalAppTrial } from '../browser/external-app-cleanup';

for (const failure of ['context', 'http connections', 'http close', 'launcher']) {
  test(`native trial cleanup continues after ${failure} fails and preserves the test failure`, async ({ onTestFinished }) => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'chromerehome-cleanup-test-'));
    onTestFinished(() => rm(profileRoot, { recursive: true, force: true }));
    await writeFile(join(profileRoot, 'owned-profile'), 'disposable');
    const attempted: string[] = [];
    const cleanupError = new Error(failure);
    const originalError = new Error('original native assertion');
    const step = async (name: string) => {
      attempted.push(name);
      if (failure === name) throw cleanupError;
    };
    const server = (name: string) => ({
      closeAllConnections() {
        attempted.push(`${name} connections`);
        if (failure === `${name} connections`) throw cleanupError;
      },
      close(done: (error?: Error) => void) {
        attempted.push(`${name} close`);
        if (failure === `${name} close`) throw cleanupError;
        done();
      }
    });
    const trial = async () => {
      try {
        throw originalError;
      } finally {
        await cleanupExternalAppTrial({
          context: { close: () => step('context') },
          servers: [server('http'), undefined, server('https')],
          launcher: { dispose: () => step('launcher') },
          profileRoot
        }, true);
      }
    };
    await expect(trial()).rejects.toBe(originalError);
    expect(attempted).toEqual(['context', 'http connections', 'http close', 'https connections', 'https close', 'launcher']);
    await expect(stat(profileRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });
}

test('native trial cleanup reports cleanup errors when the test succeeded, after releasing the profile', async ({ onTestFinished }) => {
  const profileRoot = await mkdtemp(join(tmpdir(), 'chromerehome-cleanup-test-'));
  onTestFinished(() => rm(profileRoot, { recursive: true, force: true }));
  const closeError = new Error('close');
  const disposeError = new Error('dispose');
  await expect(cleanupExternalAppTrial({
    context: { async close() { throw closeError; } },
    servers: [],
    launcher: { async dispose() { throw disposeError; } },
    profileRoot
  }, false)).rejects.toMatchObject({ errors: [closeError, disposeError] });
  await expect(stat(profileRoot)).rejects.toMatchObject({ code: 'ENOENT' });
});
