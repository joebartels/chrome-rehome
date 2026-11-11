import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [chromePath, oldDist, newDist, output, nativeHelper] = process.argv.slice(2);
assert(chromePath && oldDist && newDist && output,
  'Usage: node qualify.mjs CHROME OLD_DIST NEW_DIST EVIDENCE_JSON [MACOS_NATIVE_HELPER]');
assert(process.platform === 'darwin' || process.platform === 'linux');
if (process.platform === 'darwin') assert(nativeHelper, 'Compile and supply the macOS native helper');
const os = process.platform === 'darwin'
  ? execFileSync('/usr/bin/sw_vers', ['-productVersion'], {encoding:'utf8'}).trim()
  : execFileSync('uname', ['-sr'], {encoding:'utf8'}).trim();
const binary = execFileSync(chromePath, ['--version'], { encoding: 'utf8' }).trim();
const floor = binary.includes(' 120.');
const report = { binary, node: process.version, platform: process.platform, arch: process.arch, os, checks: [] };
const record = (name, details) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};

async function inventory(root, dir = '') {
  const result = {};
  for (const entry of (await readdir(join(root, dir), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(result, await inventory(root, path));
    else {
      assert(entry.isFile(), 'Unexpected package entry: ' + path);
      const bytes = await readFile(join(root, path));
      result[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  }
  return result;
}

async function until(label, sample, accept = Boolean, timeout = 10000) {
  const stop = Date.now() + timeout;
  let value;
  let error;
  do {
    try {
      value = await sample();
      if (accept(value)) return value;
      error = undefined;
    } catch (failure) { error = failure; }
    await delay(50);
  } while (Date.now() < stop);
  throw Error(label + ' timed out. Last observation: ' + JSON.stringify(value) + (error ? ' ' + error : ''));
}

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const { id, result, error } = JSON.parse(data);
      const request = this.pending.get(id);
      if (!request) return;
      this.pending.delete(id);
      clearTimeout(request.timer);
      if (error) request.reject(Error(request.method + ': ' + error.message));
      else request.resolve(result);
    });
    this.socket.addEventListener('close', () => {
      for (const { timer, reject } of this.pending.values()) {
        clearTimeout(timer);
        reject(Error('Chrome closed the CDP connection'));
      }
      this.pending.clear();
    });
  }
  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(method + ' timed out'));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => this.send(method, params, sessionId);
    return {
      targetId, send,
      async eval(fn, arg) {
        const expression = '(' + fn.toString() + ')(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')';
        const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (exceptionDetails) throw Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      },
    };
  }
  async open(url) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const page = await this.attach(targetId);
    const result = await page.send('Page.navigate', { url });
    assert(!result.errorText, result.errorText);
    return page;
  }
  async target(label, predicate) {
    const target = await until(label, async () => (await this.send('Target.getTargets')).targetInfos.find(predicate));
    return this.attach(target.targetId);
  }
}

const flags = [
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
  '--disable-sync', '--disable-default-apps', '--no-proxy-server', '--use-mock-keychain', '--disable-search-engine-choice-screen', '--password-store=basic',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  '--window-size=1140,760', '--remote-debugging-port=0', '--lang=en-US',
  ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
];

async function browser(name, dist, scenario) {
  const root = await mkdtemp(join(tmpdir(), 'chromerehome-release-'));
  const profile = join(root, 'profile');
  const extension = join(root, 'extension');
  await cp(resolve(dist), extension, { recursive: true });
  assert.deepEqual(await inventory(extension), await inventory(resolve(dist)));
  const child = spawn(chromePath, [...flags, '--user-data-dir=' + profile,
    '--disable-extensions-except=' + extension, '--load-extension=' + extension, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let exit;
  const closed = new Promise(resolve => {
    child.on('error', error => { exit = String(error); resolve(); });
    child.on('exit', (code, signal) => { exit = { code, signal }; resolve(); });
  });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
  let cdp;
  try {
    const [port, path] = await until(name + ' DevToolsActivePort', async () => {
      if (exit) throw Error('Chrome exited: ' + JSON.stringify(exit));
      return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
    });
    cdp = new CDP('ws://127.0.0.1:' + port + path);
    const build = await cdp.send('Browser.getVersion');
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    assert.equal(processInfo.find(process => process.type === 'browser')?.id, child.pid);
    assert(binary.includes(build.product.split('/').at(-1)));
    const worker = await until('packaged extension worker target', async () => {
      const { targetInfos } = await cdp.send('Target.getTargets');
      report.workerURLs = targetInfos.filter(target => target.type === 'service_worker').map(target => target.url);
      return targetInfos.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension:') &&
        new URL(t.url).pathname === '/background/index.js');
    });
    const extensionId = new URL(worker.url).host;
    const base = 'chrome-extension://' + extensionId;
    await scenario({ cdp, extension, extensionId, base, pid: child.pid, build });
  } catch (error) {
    (report.browserFailures ??= []).push({ name, exit, stderr });
    throw error;
  } finally {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => {});
      cdp.socket.close();
    }
    await Promise.race([closed, delay(1000)]);
    if (!exit) { child.kill(); await closed; }
    await rm(root, { recursive: true, force: true });
  }
}

function fixtureBody(url) {
  const path = new URL(url, 'http://127.0.0.1').pathname.slice(1);
  return '<!doctype html><title>CRH release ' + path.replace(/[^a-z0-9-]/gi, '') +
    '</title><a href="/remote-target">Remote target</a><script>document.addEventListener("click",event=>{document.body.dataset.input=JSON.stringify({trusted:event.isTrusted,meta:event.metaKey,ctrl:event.ctrlKey})})</script>';
}
const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(fixtureBody(request.url));
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = 'http://127.0.0.1:' + server.address().port;

const manifest = page => page.eval(() => ({ id: chrome.runtime.id, version: chrome.runtime.getManifest().version }));
const storage = page => page.eval(() => chrome.storage.local.get());
const status = page => page.eval(() => document.querySelector('#status-message')?.textContent);
const options = async ({ cdp, base }) => {
  const page = await cdp.open(base + '/options/index.html');
  await until('options render', () => page.eval(() => ({ url: location.href, status: document.querySelector('#status-message')?.textContent })), value => value.status?.startsWith('Automatic replacement'));
  return page;
};
const button = (page, label) => page.eval(name => {
  const target = [...document.querySelectorAll('button')].find(node => node.textContent === name);
  if (!target || target.disabled) throw Error('Button unavailable: ' + name);
  target.click();
}, label);
const create = async (page, path, properties = {}) => {
  const tab = await page.eval(value => chrome.tabs.create(value), { url: origin + '/' + path, ...properties });
  return until('fixture tab loaded ' + path, () => page.eval(id => chrome.tabs.get(id), tab.id),
    actual => actual.status === 'complete' && actual.url === origin + '/' + path && actual.title === 'CRH release ' + path);
};
const state = page => page.eval(async () => ({
  windows: (await chrome.windows.getAll({ windowTypes: ['normal'] })).map(({id, focused, state}) => ({id, focused, state})),
  tabs: (await chrome.tabs.query({ windowType: 'normal' })).map(({id, windowId, groupId, index, active, url}) => ({id, windowId, groupId, index, active, url})),
  groups: await chrome.tabGroups.query({}),
}));
const protections = page => page.eval(async () => (await chrome.storage.session.get('chromeReHomeProtections')).chromeReHomeProtections);
const badge = (page, tabId) => page.eval(async id => ({ text: await chrome.action.getBadgeText({tabId:id}), title: await chrome.action.getTitle({tabId:id}) }), tabId);
const popupState = page => page.eval(() => ({ heading: document.querySelector('#status-heading')?.textContent,
  enabled: !document.querySelector('#protect')?.disabled, checked: document.querySelector('#protect')?.checked }));
const popupDetails = page => page.eval(() => ({
  heading: document.querySelector('#status-heading')?.textContent,
  description: document.querySelector('#status-description')?.textContent,
  message: document.querySelector('#message')?.textContent,
  targetMessage: document.querySelector('#target-message')?.textContent,
  resumeDisabled: document.querySelector('#resume')?.disabled,
  protectionDisabled: document.querySelector('#protect')?.disabled,
  checked: document.querySelector('#protect')?.checked,
}));
async function verifyPopup(popup, observer, label, accept) {
  try { return await until(label, () => popupDetails(popup), accept); }
  catch (error) {
    const observed = await Promise.allSettled([
      popupDetails(popup), storage(observer), protections(observer),
      observer.eval(() => chrome.runtime.sendMessage({kind:'get-status'})),
    ]);
    report.popupFailure = { label, popup:observed[0], config:observed[1], protection:observed[2], workerStatus:observed[3] };
    throw error;
  }
}
const pressControl = (page, id) => page.eval(controlId => {
  const control = document.getElementById(controlId);
  if (!control || control.disabled) throw Error('Popup control is disabled: ' + controlId);
  control.click();
}, id);
const selectedProtection = (page, expected) => until('exact popup protection records', () => protections(page),
  value => value?.version === 1 && value.tabs.length === expected.length &&
    value.tabs.every(({tabId, incognito}, index) => tabId === expected[index] && incognito === false));
const waitTab = (page, tabId, condition) => until('expected placement for tab ' + tabId,
  () => page.eval(id => chrome.tabs.get(id), tabId), condition);

const native = async (pid, ...args) => JSON.parse((await run(nativeHelper, [String(pid), ...args], { timeout:10000 })).stdout);
async function focusEvidence(pid, expectedTitle) {
  return until('OS-owned active window ' + expectedTitle, async () => {
    if (process.platform === 'darwin') return native(pid, 'focus');
    const { stdout: id } = await run('xdotool', ['getactivewindow']);
    const { stdout: title } = await run('xdotool', ['getwindowname', id.trim()]);
    const { stdout: owner } = await run('xdotool', ['getwindowpid', id.trim()]);
    return { pid, frontmostPid: Number(owner.trim()), nativeWindow: Number(id.trim()), title:title.trim() };
  }, value => value.frontmostPid === pid && value.title?.includes(expectedTitle));
}
async function clickLink(page, modifiers = 0) {
  const point = await page.eval(() => {
    const { x, y, width, height } = document.querySelector('a').getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2 };
  });
  await page.send('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', button: 'left', clickCount: 1, modifiers });
  await page.send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', button: 'left', clickCount: 1, modifiers });
}

async function setActive(page, tab) {
  await page.eval(async ({ id, windowId }) => {
    await chrome.tabs.update(id, { active: true });
    await chrome.windows.update(windowId, { focused: true });
  }, tab);
}

async function updateTrial(env) {
  const { cdp, extension, extensionId, build } = env;
  const previous = await options(env);
  assert.deepEqual(await manifest(previous), { id:extensionId, version:'0.1.2' });
  assert.deepEqual(await storage(previous), {});
  const settings = await cdp.open('chrome://extensions');
  await until('Extensions manager is ready', () => settings.eval(() => !!chrome.developerPrivate?.getProfileConfiguration));
  await settings.eval(async () => {
    if (!(await chrome.developerPrivate.getProfileConfiguration()).inDeveloperMode) {
      await chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true});
    }
  });
  await until('owned profile developer mode', () => settings.eval(async () =>
    (await chrome.developerPrivate.getProfileConfiguration()).inDeveloperMode));
  const installed = async () => settings.eval(async () =>
    (await chrome.developerPrivate.getExtensionsInfo({ includeDisabled:true, includeTerminated:true }))
      .filter(info => info.name === 'ChromeReHome')
      .map(({id, version, state, disableReasons, manifestErrors}) => ({id, version, state, disableReasons, manifestErrors})));
  const before = await until('Chrome extensions inventory for baseline', installed,
    value => value.length === 1 && value[0].version === '0.1.2');
  assert.equal(before[0].state, 'ENABLED');
  await button(previous, 'Add grouping rule');
  await previous.eval(pattern => {
    const [patternInput, groupInput] = [...document.querySelectorAll('input[type=text]')];
    patternInput.value = pattern;
    patternInput.dispatchEvent(new Event('input', {bubbles:true}));
    groupInput.value = 'Persisted release rule';
    groupInput.dispatchEvent(new Event('input', {bubbles:true}));
  }, origin + '/remote-*');
  await button(previous, 'Save settings');
  const saved = await until('settings persisted from previous package', () => storage(previous), value => !!value.chromeReHomeConfig);
  assert.deepEqual(saved, { chromeReHomeConfig: { schemaVersion:4, enabled:false,
    groupingRules:[{ enabled:true, pattern:origin + '/remote-*', group:'Persisted release rule' }], duplicateRules:[] } });

  // Swap the entire package at the path Chrome used to derive this unpacked ID.
  await rm(extension, { recursive:true });
  await cp(resolve(newDist), extension, { recursive:true });
  assert.deepEqual(await inventory(extension), report.releaseInventory);
  const loadError = await settings.eval(id => chrome.developerPrivate.reload(id, {
    failQuietly: true, populateErrorForUnpacked: true,
  }), extensionId);
  assert(!loadError, 'Chrome reported an unpacked reload error: ' + JSON.stringify(loadError));
  const after = await until('Chrome extensions inventory for update', installed,
    value => value.length === 1 && value[0].version === '0.1.3');
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[0].state, before[0].state);
  const updated = await options(env);
  assert.deepEqual(await manifest(updated), { id:extensionId, version:'0.1.3' });
  assert.deepEqual(await storage(updated), saved);
  assert.match(await status(updated), /disabled/);
  record('0.1.2 to 0.1.3 unpacked reload preserves ID and saved settings', { build, before, after, saved });
}

async function freshTrial(env) {
  const { cdp, extensionId, base, pid, build } = env;
  const observer = await options(env);
  assert.deepEqual(await manifest(observer), { id:extensionId, version:'0.1.3' });
  assert.equal(await observer.eval(() => document.querySelector('#status-heading').textContent), 'ChromeReHome installed');
  assert.match(await status(observer), /disabled/);
  const first = await create(observer, 'paused-duplicate');
  const second = await create(observer, 'paused-duplicate');
  const popup = await cdp.open(base + '/popup/index.html');
  await setActive(observer, second);
  report.popupSetup = await popup.eval(async id => {
    const tab = await chrome.tabs.get(id);
    const current = await chrome.windows.getCurrent();
    return { tab, hasPendingUrl: 'pendingUrl' in tab, window:current.id,
      selected: (await chrome.tabs.query({windowId:current.id,active:true})).map(tab => tab.id),
      frame: await chrome.webNavigation.getFrame({ tabId:id, frameId:0 }) };
  }, second.id);
  const paused = await until('packaged popup paused with a selected web tab', () => popupState(popup), value => value.heading === 'Paused' && value.enabled);
  assert.deepEqual(paused, { heading:'Paused', enabled:true, checked:false });
  const pristine = await storage(observer);
  assert.deepEqual(pristine, {});
  const unchanged = (await state(observer)).tabs.filter(tab => [first.id, second.id].includes(tab.id));
  assert.equal(unchanged.length, 2);
  assert(unchanged.every(tab => tab.groupId === -1));
  record('fresh install leaves default paused and retains duplicates', { build, extensionId, pristine, paused, unchanged });

  const legacy = { schemaVersion:3, enabled:false,
    groupingRules:[{pattern:origin + '/remote-*', group:'Release group'}],
    duplicateRules:[{origin, ignoreQueryParameters:['utm_source'], ignoreFragment:false,
      ignoreTrailingSlash:false, sortQueryParameters:true}] };
  const migrated = { ...legacy, schemaVersion:4,
    groupingRules:legacy.groupingRules.map(rule => ({...rule, enabled:true})),
    duplicateRules:legacy.duplicateRules.map(rule => ({...rule, enabled:true})) };
  await observer.eval(value => chrome.storage.local.set({chromeReHomeConfig:value}), legacy);
  const migratedOptions = await options(env);
  const draft = await migratedOptions.eval(() => ({
    checks: [...document.querySelectorAll('input[type=checkbox]')].map(input => input.checked),
    texts: [...document.querySelectorAll('input[type=text], textarea')].map(input => input.value),
  }));
  assert(draft.texts.includes('Release group'));
  assert(draft.texts.includes('utm_source'));
  assert(draft.checks.filter(Boolean).length >= 3);
  assert.deepEqual(await storage(observer), { chromeReHomeConfig:legacy });
  await button(migratedOptions, 'Save settings');
  const persisted = await until('Save persists schema 4', () => storage(observer), value => value.chromeReHomeConfig?.schemaVersion === 4);
  assert.deepEqual(persisted, { chromeReHomeConfig:migrated });
  record('schema 3 settings load without writing and Save persists schema 4', { legacy, draft, persisted });

  await setActive(observer, second);
  await until('popup protection available', () => popupState(popup), value => value.heading === 'Paused' && value.enabled && !value.checked);
  await pressControl(popup, 'protect');
  const protectedTab = await selectedProtection(observer, [second.id]);
  const lockedBadge = await until('protected badge', () => badge(observer, second.id), value => value.text === '🔒');
  assert.equal(lockedBadge.title, 'ChromeReHome — tab protected');
  assert.deepEqual(await badge(observer, first.id), { text:'', title:'ChromeReHome' });
  await until('popup reflects protection', () => popupState(popup), value => value.heading === 'Paused' && value.enabled && value.checked);
  await pressControl(popup, 'protect');
  await selectedProtection(observer, []);
  const clearedBadge = await until('cleared badge', () => badge(observer, second.id), value => value.text === '');
  assert.equal(clearedBadge.title, 'ChromeReHome');
  // Badge clearing can precede command verification when admission is checking.
  // Wait for the popup to confirm the target and reenable Resume before using it.
  const settled = await verifyPopup(popup, observer, 'popup confirms clearing protection', value =>
    value.heading === 'Paused' && !value.protectionDisabled && !value.checked && !value.resumeDisabled);
  record('packaged popup protects and unprotects only the selected tab while paused', {
    selectedTab:second.id, protectedTab, lockedBadge, clearedBadge, settled,
    surface:'popup document in inactive extension tab',
  });

  await pressControl(popup, 'resume');
  await verifyPopup(popup, observer, 'popup resumes processing', value => value.heading === 'Active');
  const remote = await observer.eval(() => chrome.windows.create({url:'about:blank',focused:false}));
  const member = await create(observer, 'remote-member', {windowId:remote.id, active:true});
  const grouped = await waitTab(observer, member.id, tab => tab.groupId !== -1);
  const group = await observer.eval(id => chrome.tabGroups.get(id), grouped.groupId);
  assert.equal(group.title, 'Release group');
  assert.equal(group.windowId, remote.id);
  const unmatchedSpare = await create(observer, 'destination-spare', {windowId:remote.id, active:true});
  await observer.eval(id => chrome.tabGroups.update(id, { collapsed:true }), group.id);

  const source = await create(observer, 'foreground-before', {windowId:second.windowId});
  const sourcePage = await cdp.target('foreground fixture target', t => t.url === source.url);
  await setActive(observer, source);
  const before = await focusEvidence(pid, 'CRH release foreground-before');
  assert((await state(observer)).windows.some(window => window.id === source.windowId && window.focused));
  await clickLink(sourcePage);
  const placed = await waitTab(observer, source.id, tab => tab.windowId === remote.id && tab.groupId === group.id && tab.active && tab.url === origin + '/remote-target');
  const destination = await focusEvidence(pid, 'CRH release remote-target');
  const after = await state(observer);
  assert(after.windows.some(window => window.id === remote.id && window.focused));
  assert.equal(after.groups.find(value => value.id === group.id).collapsed, false);
  if (process.platform === 'linux') assert.notEqual(before.nativeWindow, destination.nativeWindow);
  record('ordinary navigation creates and reuses a named group across windows and follows foreground attention', {
    group, member:grouped.id, placed, before, destination, browserWindows:after.windows,
  });

  const backgroundSource = await create(observer, 'background-before', {windowId:second.windowId});
  const backgroundPage = await cdp.target('background fixture target', t => t.url === backgroundSource.url);
  await observer.eval(id => chrome.tabs.update(id, {active:true}), unmatchedSpare.id);
  await observer.eval(id => chrome.tabGroups.update(id, {collapsed:true}), group.id);
  await setActive(observer, backgroundSource);
  const beforeBackground = await focusEvidence(pid, 'CRH release background-before');
  await clickLink(backgroundPage, process.platform === 'darwin' ? 4 : 2);
  const backgroundInput = await until('fixture sees trusted modified click', () => backgroundPage.eval(() => JSON.parse(document.body.dataset.input || 'null')));
  assert.equal(backgroundInput.trusted, true);
  assert.equal(process.platform === 'darwin' ? backgroundInput.meta : backgroundInput.ctrl, true);
  const replacement = await until('incoming background duplicate replaces older remote tab', () => state(observer), snapshot => {
    const matching = snapshot.tabs.filter(tab => tab.url === origin + '/remote-target');
    return matching.length === 1 && matching[0].id !== source.id && matching[0].windowId === remote.id && matching[0].groupId === group.id;
  });
  assert(!replacement.tabs.some(tab => tab.id === source.id));
  assert(replacement.tabs.some(tab => tab.id === member.id));
  assert(replacement.tabs.some(tab => tab.id === unmatchedSpare.id && tab.active));
  assert(replacement.tabs.some(tab => tab.id === backgroundSource.id && tab.active));
  assert(replacement.windows.some(window => window.id === backgroundSource.windowId && window.focused));
  assert.equal(replacement.groups.find(value => value.id === group.id).collapsed, true);
  const afterBackground = await focusEvidence(pid, 'CRH release background-before');
  if (process.platform === 'linux') assert.equal(afterBackground.nativeWindow, beforeBackground.nativeWindow);
  const replacementTab = replacement.tabs.find(tab => tab.url === origin + '/remote-target');
  const committed = await waitTab(observer, replacementTab.id, tab => tab.status === 'complete' && tab.title === 'CRH release remote-target');
  record('trusted modified click replaces older duplicate in remote group and preserves attention', {
    backgroundInput, olderId:source.id, committed, replacement, beforeBackground, afterBackground,
  });

  await until('popup confirms active target before Pause', () => popupState(popup), value => value.heading === 'Active' && value.enabled);
  await pressControl(popup, 'pause');
  await until('popup pauses processing again', () => popupState(popup), value => value.heading === 'Paused');

  if (!floor && process.platform === 'darwin') {
    const inactive = await create(observer, 'native-inactive', {active:false, windowId:second.windowId});
    await setActive(observer, second);
    const osBefore = await focusEvidence(pid, 'CRH release paused-duplicate');
    const selectionBefore = (await state(observer)).tabs;
    const menu = await native(pid, 'tab-menu', 'CRH release native-inactive', 'Toggle tab protection');
    const nativeProtection = await selectedProtection(observer, [inactive.id]);
    const nativeBadge = await until('native protection badge', () => badge(observer, inactive.id), value => value.text === '🔒');
    assert.deepEqual((await state(observer)).tabs, selectionBefore);
    assert.deepEqual(await storage(observer), persisted);
    const secondMenu = await native(pid, 'tab-menu', 'CRH release native-inactive', 'Toggle tab protection');
    await selectedProtection(observer, []);
    await until('native unprotected badge', () => badge(observer, inactive.id), value => value.text === '');
    assert.deepEqual((await state(observer)).tabs, selectionBefore);
    record('actual stable native tab-strip menu toggles only its inactive tab', { osBefore, menu, secondMenu, nativeProtection, nativeBadge, inactiveTab:inactive.id, activeTab:second.id });
  }

}

try {
  report.previousInventory = await inventory(resolve(oldDist));
  report.releaseInventory = await inventory(resolve(newDist));
  const failures = [];
  for (const [name, dist, trial] of [['fresh install', newDist, freshTrial], ['existing profile update', oldDist, updateTrial]]) {
    try { await browser(name, dist, trial); }
    catch (error) {
      failures.push({ scenario:name, error:String(error.stack ?? error) });
      console.error(error);
      process.exitCode = 1;
    }
  }
  if (failures.length) report.failures = failures;
} catch (error) {
  report.error = String(error.stack ?? error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await new Promise(resolve => server.close(resolve));
  await mkdir(resolve(output, '..'), { recursive:true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
