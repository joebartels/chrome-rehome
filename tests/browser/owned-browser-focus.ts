import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowserContext } from '@playwright/test';

/** Activate only the browser process belonging to this isolated test context. */
export async function activateOwnedBrowser(context: BrowserContext) {
  if (process.platform !== 'darwin') return;
  const browser = context.browser();
  if (!browser) throw Error('Owned browser is unavailable.');
  const session = await browser.newBrowserCDPSession();
  let pid: number | undefined;
  try {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo');
    const browsers = processInfo.filter(entry => entry.type === 'browser');
    if (browsers.length === 1) pid = browsers[0]!.id;
  } finally { await session.detach(); }
  if (!Number.isSafeInteger(pid) || pid! <= 0) throw Error('Owned browser PID is unavailable.');
  const { stdout } = await promisify(execFile)('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
ObjC.import('AppKit');
const pid = ${pid};
const beforeFrontmostPid = $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
const requested = app.activateWithOptions(2);
const deadline = Date.now() + 5000;
while ($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier !== pid && Date.now() < deadline)
  $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01));
JSON.stringify({pid, beforeFrontmostPid, requested, frontmostPid: $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier});
`], { timeout: 10_000 });
  const status = JSON.parse(stdout) as { pid: number; beforeFrontmostPid: number; requested: boolean; frontmostPid: number };
  if (status.pid !== pid || status.frontmostPid !== pid) throw Error('Owned browser did not become frontmost: ' + JSON.stringify(status));
  console.info('owned browser activation', JSON.stringify(status));
  return status;
}
