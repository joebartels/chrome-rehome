import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Owns a uniquely identified bundled app; caller closes its browser before disposal. */
export async function createExternalAppLauncher(executablePath: string) {
  if (process.platform !== 'darwin') throw new Error('Native external app launch requires macOS.');
  const source = await realpath(executablePath);
  const sourceApp = dirname(dirname(dirname(source)));
  if (!sourceApp.endsWith('.app') || dirname(source) !== join(sourceApp, 'Contents', 'MacOS')
    || !(await stat(source)).isFile()) {
    throw new Error('Expected an executable inside a bundled macOS .app.');
  }
  await stat(join(sourceApp, 'Contents', 'Info.plist'));
  const root = await mkdtemp(join(tmpdir(), 'chromerehome-external-app-'));
  const app = join(root, 'ChromeReHome External Trial.app');
  let disposed = false;
  try {
    await execute('/bin/cp', ['-cR', sourceApp, app]);
    await execute('/usr/libexec/PlistBuddy', ['-c',
      `Set :CFBundleIdentifier org.chromerehome.externaltrial.${randomUUID()}`,
      join(app, 'Contents', 'Info.plist')]);
    return {
      executablePath: join(app, relative(sourceApp, source)),
      async open(url: string) {
        if (disposed) throw new Error('External app launcher is disposed.');
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs may be externally opened.');
        await execute('/usr/bin/open', ['-a', app, url]);
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        await rm(root, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
