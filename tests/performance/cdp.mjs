import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function until(read, label, timeout = 15_000, interval = 40) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const result = await read();
    if (result) return result;
    await delay(interval);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

class Connection {
  #id = 0;
  #calls = new Map();
  #events = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const callback = this.#calls.get(message.id);
        this.#calls.delete(message.id);
        callback?.(message);
      } else {
        this.#events.get(`${message.sessionId ?? ''}:${message.method}`)?.forEach(callback => callback(message.params));
      }
    });
    socket.addEventListener('close', () => {
      for (const callback of this.#calls.values()) callback({ error: { message: 'CDP connection closed' } });
      this.#calls.clear();
    });
  }

  call(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#calls.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 120_000);
      this.#calls.set(id, ({ result, error }) => {
        clearTimeout(timer);
        if (error) reject(new Error(`${method}: ${error.message}`));
        else resolve(result);
      });
      try {
        this.socket.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (error) {
        clearTimeout(timer);
        this.#calls.delete(id);
        reject(error);
      }
    });
  }

  async attach(targetId) {
    const { sessionId } = await this.call('Target.attachToTarget', { targetId, flatten: true });
    return {
      call: (method, params) => this.call(method, params, sessionId),
      on: (method, callback) => {
        const key = `${sessionId}:${method}`;
        if (!this.#events.has(key)) this.#events.set(key, new Set());
        this.#events.get(key).add(callback);
      },
      detach: () => this.call('Target.detachFromTarget', { sessionId }),
    };
  }
}

export async function evaluate(session, fn, argument) {
  const { result, exceptionDetails } = await session.call('Runtime.evaluate', {
    expression: `(${fn.toString()})(${JSON.stringify(argument)})`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

export async function launchBrowser(executable, extension, headed) {
  const profile = await mkdtemp(join(tmpdir(), 'chromerehome-perf-profile-'));
  const args = [
    ...(headed ? [] : ['--headless=new']),
    `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
    '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server',
    '--disable-default-apps', '--disable-search-engine-choice-screen', '--password-store=basic', '--use-mock-keychain',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', '--window-size=1140,760',
    ...(globalThis.process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    'about:blank',
  ];
  const process = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  let launchError;
  process.on('error', error => { launchError = error; });
  process.stderr.on('data', chunk => { log = (log + chunk.toString()).slice(-4000); });
  const exited = new Promise(resolve => process.once('close', resolve));
  let browser;
  async function close() {
    try {
      if (browser && process.exitCode === null) await browser.call('Browser.close').catch(() => {});
      if (process.exitCode === null) process.kill('SIGTERM');
      await Promise.race([exited, delay(3000)]);
      if (process.exitCode === null && process.signalCode === null) {
        process.kill('SIGKILL');
        await exited;
      }
    } finally {
      browser?.socket.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  try {
    const endpoint = await until(async () => {
      if (launchError) throw launchError;
      if (process.exitCode !== null) throw new Error(`Chrome exited during launch: ${log}`);
      const file = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
      return file.includes('/devtools/browser/') ? file.trim().split('\n') : undefined;
    }, 'Chrome DevTools endpoint', 30_000);
    const socket = new WebSocket(`ws://127.0.0.1:${endpoint[0]}${endpoint[1]}`);
    await once(socket, 'open');
    browser = new Connection(socket);
    const worker = await until(async () => (await browser.call('Target.getTargets')).targetInfos.find(
      target => target.type === 'service_worker' && target.url.startsWith('chrome-extension://') && target.url.endsWith('/background/index.js'),
    ), 'initial extension service worker');
    const extensionId = new URL(worker.url).hostname;
    const version = await browser.call('Browser.getVersion');
    assert.ok(process.pid);
    return { browser, extensionId, version, pid: process.pid, log: () => log, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function attachPage(browser, url) {
  const { targetId } = await browser.call('Target.createTarget', { url });
  const page = await browser.attach(targetId);
  return { ...page, targetId, close: () => browser.call('Target.closeTarget', { targetId }) };
}

export async function observeWorker(page, extensionId) {
  const transitions = [];
  const versions = new Map();
  const prefix = `chrome-extension://${extensionId}/`;
  page.on('ServiceWorker.workerVersionUpdated', ({ versions: updates }) => {
    for (const version of updates.filter(entry => entry.scriptURL.startsWith(prefix))) {
      const previous = versions.get(version.versionId);
      versions.set(version.versionId, version);
      if (previous?.runningStatus !== version.runningStatus) {
        transitions.push({ versionId: version.versionId, status: version.runningStatus, elapsedMs: performance.now() });
      }
    }
  });
  await page.call('ServiceWorker.enable');
  const current = () => [...versions.values()].find(version => version.status === 'activated');
  return {
    transitions,
    current,
    async stop() {
      const version = await until(current, 'activated worker');
      if (version.runningStatus !== 'stopped') {
        await page.call('ServiceWorker.stopWorker', { versionId: version.versionId });
        await until(() => versions.get(version.versionId)?.runningStatus === 'stopped', 'explicit worker stop');
      }
      assert.equal(current()?.runningStatus, 'stopped');
    },
  };
}
