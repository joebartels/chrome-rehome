import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A trial-owned empty AppKit window; never activates a personal application. */
export async function createForegroundHelper() {
  const root = await mkdtemp(join(tmpdir(), 'chromerehome-foreground-helper-'));
  const script = join(root, 'helper.js');
  await writeFile(script, `ObjC.import('AppKit');
const app = $.NSApplication.sharedApplication;
app.setActivationPolicy(0);
const window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(100,100,320,120), 1, 2, false);
window.title = 'ChromeReHome owned trial helper';
window.makeKeyAndOrderFront(null);
app.activateIgnoringOtherApps(true);
const pid = $.NSProcessInfo.processInfo.processIdentifier;
const deadline = Date.now() + 5000;
while ($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier !== pid && Date.now() < deadline) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01));
const status = {pid, frontmostPid: $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier};
$.NSFileHandle.fileHandleWithStandardOutput.writeData($(JSON.stringify(status)+'\\n').dataUsingEncoding($.NSUTF8StringEncoding));
app.run;
`);
  const child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const exited = new Promise<void>(resolve => { child.once('exit', () => resolve()); child.once('error', () => resolve()); });
  async function dispose() {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    await rm(root, { recursive: true, force: true });
  }
  try {
    const status = await new Promise<{ pid: number; frontmostPid: number }>((resolve, reject) => {
      let stdout = '';
      const timeout = setTimeout(() => reject(new Error('Owned foreground helper readiness timed out: ' + stderr)), 10_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('Owned foreground helper exited: ' + stderr)); });
      child.stdout.on('data', chunk => {
        stdout += String(chunk);
        if (!stdout.includes('\n')) return;
        clearTimeout(timeout);
        try { resolve(JSON.parse(stdout.split('\n')[0]!)); } catch (error) { reject(error); }
      });
    });
    if (status.pid !== child.pid || status.frontmostPid !== child.pid) throw new Error('Owned helper did not become frontmost: ' + JSON.stringify({ ...status, expectedPid: child.pid }));
    return { status, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
