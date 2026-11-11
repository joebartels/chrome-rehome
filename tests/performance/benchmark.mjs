import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { evaluate, launchBrowser, observeWorker, until } from './cdp.mjs';
import { assertOutcome, configure, hasExpectedMutation, optionsPage, prepare, readStatus, seedProfile, snapshot } from './fixture.mjs';
import { instrumentBundle } from './probe.mjs';

const modes = ['warm', 'cold'];
const allScenarios = ['no-match', 'grouping', 'replacement-background', 'replacement-foreground'];
const exec = promisify(execFile);

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  assert.ok(Number.isInteger(number) && number >= minimum && number <= maximum, `Invalid ${label}: ${value}`);
  return number;
}

function statistics(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { n: sorted.length, median, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], min: sorted[0], max: sorted.at(-1) };
}

async function inventory(directory) {
  const paths = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => relative(directory, join(entry.parentPath, entry.name))).sort();
  const files = await Promise.all(paths.map(async path => {
    const bytes = await readFile(join(directory, path));
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  return { extensionVersion: manifest.version, bytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
}

async function memory(chrome) {
  const { processInfo } = await chrome.browser.call('SystemInfo.getProcessInfo');
  const ids = [...new Set([chrome.pid, ...processInfo.map(process => process.id)])];
  try {
    const { stdout } = await exec('ps', ['-o', 'pid=,rss=', '-p', ids.join(',')]);
    const rss = stdout.trim().split('\n').filter(Boolean).map(line => line.trim().split(/\s+/).map(Number));
    assert.ok(rss.length && rss.every(([pid, kib]) => ids.includes(pid) && Number.isFinite(kib)));
    return { processCount: rss.length, rssKiB: rss.reduce((sum, [, kib]) => sum + kib, 0) };
  } catch (error) {
    return { error: error.message };
  }
}

async function workerHeap(chrome) {
  const { targetInfos } = await chrome.browser.call('Target.getTargets');
  const worker = targetInfos.find(target => target.type === 'service_worker'
    && target.url.startsWith(`chrome-extension://${chrome.extensionId}/`));
  assert.ok(worker, 'live extension worker for isolate memory measurement');
  const session = await chrome.browser.attach(worker.targetId);
  try {
    return await session.call('Runtime.getHeapUsage');
  } finally {
    await session.detach();
  }
}

async function identity(fixture, url, instrumented) {
  return until(async () => evaluate(fixture.options, ({ url, incoming, instrumented }) => {
    const { navigation, completions } = globalThis.benchmarkEvents;
    const event = navigation.find(entry => entry.url === url && entry.tabId === incoming);
    if (!event) return;
    if (!instrumented) return { event };
    const completion = completions.find(entry => entry.url === url && entry.tabId === incoming && entry.documentId === event.documentId);
    return completion && { event, completion };
  }, { url, incoming: fixture.incoming, instrumented }), 'committed document and matching outcome acknowledgment', 15_000, 5);
}

function verifyCompletion(completion, event, scenario, mode, expectedRealm, rules) {
  assert.equal(event.transitionType, 'typed');
  assert.equal(event.documentLifecycle, 'active');
  assert.ok(event.documentId && completion.documentId === event.documentId);
  assert.equal(completion.timeStamp, event.timeStamp);
  if (mode === 'warm') assert.equal(completion.realm, expectedRealm, 'warm sample stays in established worker realm');
  else assert.notEqual(completion.realm, expectedRealm, 'cold sample uses fresh worker realm');
  const noMatch = scenario === 'no-match';
  const duplicates = Number(scenario.startsWith('replacement'));
  assert.deepEqual(completion.stages.plan, {
    destination: noMatch ? 'unchanged' : 'existing', duplicates,
    presentation: scenario === 'replacement-foreground' ? 'foreground' : 'preserve',
  });
  assert.equal(completion.stages.consume, true);
  assert.deepEqual(completion.stages.rulesPerList, [rules, rules]);
  assert.deepEqual(completion.stages.execution, { kind: 'completed', removed: duplicates });
  assert.ok(completion.calls['tabs.query'] > 0 && completion.calls['tabGroups.query'] > 0, 'sample includes fresh read');
  assert.ok(completion.completedAt >= completion.startedAt);
  assert.ok(completion.startedAt >= completion.realmStartedAt);
}

async function runSample(chrome, fixture, origin, sample, previousAnchor, previousRealm) {
  const { tabs, rules, scenario, mode, id, evidence } = sample;
  const instrumented = evidence === 'copied-worker';
  const suffix = scenario === 'grouping' ? 'group' : scenario;
  const url = `${origin}/benchmark/sample/${id}/${suffix}`;
  const { anchor, before } = await prepare(fixture, url, scenario, tabs, previousAnchor);
  const preStopStatus = await fixture.ready();
  assert.equal(preStopStatus?.phase, 'active');
  if (instrumented) assert.equal(fixture.lifecycle.current()?.runningStatus, 'running');
  const beforeTrigger = instrumented ? await settledProbe(chrome) : undefined;
  const oldRealm = beforeTrigger?.realm;
  if (previousRealm && mode === 'warm') assert.equal(oldRealm, previousRealm, 'setup reused the last worker');
  if (mode === 'cold') await fixture.lifecycle.stop();
  else assert.equal(fixture.lifecycle.current()?.runningStatus, 'running');
  const transitionOffset = fixture.lifecycle.transitions.length;
  const triggeredAt = performance.now();
  const { errorText } = await fixture.incomingCdp.call('Page.navigate', { url, transitionType: 'typed' });
  assert.equal(errorText, undefined);
  const { event, completion } = await identity(fixture, url, instrumented);
  const acknowledgedAt = performance.now();
  const noMatch = scenario === 'no-match';
  if (!instrumented && noMatch) await delay(300);
  let observedAt;
  const after = await until(async () => {
    const state = await snapshot(fixture);
    if (!hasExpectedMutation(state, fixture, anchor, url, scenario)) return;
    if (scenario === 'replacement-foreground' && state.presentation.find(window => window.focused)?.windowId !== fixture.destination) return;
    observedAt = performance.now();
    return state;
  }, 'expected Chrome tab and window state');
  assertOutcome(before, after, fixture, anchor, url, scenario);
  assert.equal(event.transitionType, 'typed');
  assert.equal(event.documentLifecycle, 'active');
  if (completion) verifyCompletion(completion, event, scenario, mode, oldRealm, rules);
  const changes = fixture.lifecycle.transitions.slice(transitionOffset);
  if (mode === 'cold') assert.ok(changes.some(event => event.status === 'running'), 'cold wake observed');
  const resources = await memory(chrome);
  const coldSettled = completion && mode === 'cold' ? await settledProbe(chrome) : undefined;
  if (coldSettled) assert.equal(coldSettled.realm, completion.realm, 'cold tail stays in measured realm');
  return {
    ...sample,
    fixture: { discarded: before.tabs.filter(tab => tab.discarded).length, afterTabs: after.tabs.length,
      beforePresentation: before.presentation, afterPresentation: after.presentation,
      incomingAfter: after.tabs.find(tab => tab.id === fixture.incoming), anchor },
    event, completion, lifecycle: changes, triggeredAt, acknowledgedAt, observedAt,
    coldSettled: coldSettled && { lastApiAfterHandlerMs: Math.max(0, coldSettled.lastApiCallAt - completion.completedAt),
      realmCalls: coldSettled.calls },
    handlerMs: completion ? completion.completedAt - completion.startedAt : undefined,
    triggerToAcknowledgmentMs: completion ? acknowledgedAt - triggeredAt : undefined,
    triggerToRunningObservationMs: mode === 'cold' ? changes.find(event => event.status === 'running').elapsedMs - triggeredAt : undefined,
    triggerToObservedMutationMs: !instrumented && !noMatch ? observedAt - triggeredAt : undefined,
    memory: resources,
  };
}

async function settledProbe(chrome) {
  const { targetInfos } = await chrome.browser.call('Target.getTargets');
  const worker = targetInfos.find(target => target.type === 'service_worker'
    && target.url.startsWith(`chrome-extension://${chrome.extensionId}/`));
  assert.ok(worker, 'live warm extension worker');
  const session = await chrome.browser.attach(worker.targetId);
  try {
    return await until(() => evaluate(session, () => globalThis.__chromeReHomeBenchmark?.settled()),
      'probe protection indicator and worker API invocations to settle', 20_000, 50);
  } finally {
    await session.detach();
  }
}

function summarize(samples) {
  const cells = new Map();
  for (const sample of samples.filter(sample => sample.evidence === 'copied-worker')) {
    const key = [sample.tabs, sample.rules, sample.mode, sample.scenario].join('/');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(sample);
  }
  return [...cells.values()].map(rows => {
    const [{ tabs, rules, mode, scenario }] = rows;
    return { tabs, rulesPerList: rules, mode, scenario,
      triggerToAcknowledgmentMs: statistics(rows.map(row => row.triggerToAcknowledgmentMs)),
      handlerMs: statistics(rows.map(row => row.handlerMs)),
      compileMs: statistics(rows.map(row => row.completion.stages.compileMs)),
      groupMatchMs: statistics(rows.map(row => row.completion.stages.groupMatchMs)),
    };
  });
}

async function runIdle(chrome, fixture) {
  const { lifecycle, options } = fixture;
  assert.equal(lifecycle.current()?.runningStatus, 'running');
  const first = lifecycle.transitions.length;
  const idleFrom = performance.now();
  // Once the options tab is gone, the harness makes no extension calls and attaches to no worker target.
  await options.close();
  const stopped = await until(() => lifecycle.transitions.slice(first).find(event => event.status === 'stopped'),
    'natural extension worker stop', 70_000, 100);
  await delay(8000);
  assert.equal(lifecycle.current()?.runningStatus, 'stopped', 'worker remains stopped without incoming events');
  const transitions = lifecycle.transitions.slice(first).map(event => ({ ...event, elapsedMs: event.elapsedMs - idleFrom }));
  assert.ok(!transitions.some(event => event.elapsedMs > stopped.elapsedMs - idleFrom && event.status !== 'stopped'));
  return { evidence: 'untouched-package / page-session ServiceWorker lifecycle', timeToStopMs: stopped.elapsedMs - idleFrom,
    postStopQuietMs: performance.now() - stopped.elapsedMs, transitions, workerDebuggerAttached: false };
}

async function main() {
  const { values } = parseArgs({ options: {
    chrome: { type: 'string' }, dist: { type: 'string', default: 'dist' }, output: { type: 'string' },
    tabs: { type: 'string', default: '20,200,1000' }, rules: { type: 'string', default: '1,25,100' },
    repetitions: { type: 'string', default: '5' }, headed: { type: 'boolean' }, 'skip-package': { type: 'boolean' },
    'idle-only': { type: 'boolean' }, 'idle-trials': { type: 'string', default: '2' }, 'skip-idle': { type: 'boolean' }, 'scenario': { type: 'string', multiple: true },
  } });
  assert.ok(values.chrome && values.output, 'Usage: node tests/performance/benchmark.mjs --chrome /absolute/chrome --output /path/report.json');
  assert.ok(!(values['idle-only'] && values['skip-idle']), '--idle-only and --skip-idle conflict');
  const scenarios = values.scenario ?? allScenarios.filter(scenario => values.headed || scenario !== 'replacement-foreground');
  assert.ok(scenarios.every(scenario => allScenarios.includes(scenario)), 'unknown scenario');
  assert.ok(values.headed || !scenarios.includes('replacement-foreground'), 'Foreground replacement requires --headed');
  const scales = values.tabs.split(',').map(value => integer(value, 'tab count', 20, 1000));
  const ruleCounts = values.rules.split(',').map(value => integer(value, 'rules per list', 1, 100));
  assert.ok(new Set(scales).size === scales.length && new Set(ruleCounts).size === ruleCounts.length
    && new Set(scenarios).size === scenarios.length, 'repeat counts and scenarios must be unique');
  const repetitions = integer(values.repetitions, 'repetitions', 1, 100);
  const idleTrials = integer(values['idle-trials'], 'idle trials', 1, 20);
  const dist = resolve(values.dist);
  const executable = resolve(values.chrome);
  const output = resolve(values.output);
  const temp = await mkdtemp(join(tmpdir(), 'chromerehome-perf-bundles-'));
  const packageDir = join(temp, 'package');
  const probeDir = join(temp, 'probe');
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><title>ChromeReHome benchmark</title>');
  });
  let git;
  try {
    git = (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim();
  } catch {
    git = undefined;
  }
  const report = {
    schema: 1, complete: false, createdAt: new Date().toISOString(), sourceGitHead: git,
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
      logicalCpuCount: cpus().length, totalMemoryBytes: totalmem(), node: process.version, chromeExecutable: executable, headed: !!values.headed },
    design: { network: 'loopback fixture server', scales, ruleCounts, repetitions, idleTrials, scenarios, modes, fillerDiscardThreshold: 1000 },
    browsers: [], samples: [], profileMemory: [], idle: [],
  };
  let sequence = 0;
  const save = async () => {
    report.summary = summarize(report.samples);
    await writeFile(output + '.tmp', JSON.stringify(report, null, 2) + '\n');
    await rename(output + '.tmp', output);
  };
  try {
    await mkdir(dirname(output), { recursive: true });
    await cp(dist, packageDir, { recursive: true });
    report.package = await inventory(packageDir);
    if (!values['idle-only']) {
      await cp(packageDir, probeDir, { recursive: true });
      const bundle = join(probeDir, 'background', 'index.js');
      await writeFile(bundle, instrumentBundle(await readFile(bundle, 'utf8')));
      report.probePackage = await inventory(probeDir);
      assert.deepEqual(report.probePackage.files.filter(file => file.path !== 'background/index.js'),
        report.package.files.filter(file => file.path !== 'background/index.js'));
    }
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function profile(evidence, tabs, execute) {
      const chrome = await launchBrowser(executable, evidence === 'copied-worker' ? probeDir : packageDir, values.headed);
      try {
        const discardFillers = tabs >= 1000;
        const fixture = await seedProfile(chrome, origin, tabs, discardFillers);
        report.browsers.push({ evidence, tabs, version: chrome.version, discardFillers });
        await execute(chrome, fixture);
      } catch (error) {
        console.error(chrome.log());
        throw error;
      } finally {
        await chrome.close();
      }
    }
    async function sample(chrome, fixture, evidence, tabs, rules, mode, scenario, repetition, anchor, realm) {
      const descriptor = { evidence, tabs, rules, mode, scenario, repetition, id: ++sequence };
      console.log(`Running ${[evidence, tabs, rules, mode, scenario, repetition].join(' ')}`);
      report.inProgress = descriptor;
      await save();
      const row = await runSample(chrome, fixture, origin, descriptor, anchor, realm);
      report.samples.push(row);
      delete report.inProgress;
      await save();
      return row;
    }
    if (!values['idle-only']) {
      for (const tabs of scales) {
        await profile('copied-worker', tabs, async (chrome, fixture) => {
          let anchor;
          let realm;
          for (const rules of ruleCounts) {
            await configure(fixture, origin, rules);
            for (let repetition = 1; repetition <= repetitions; repetition++) {
              for (const scenario of scenarios) {
                for (const mode of modes) {
                  const row = await sample(chrome, fixture, 'copied-worker', tabs, rules, mode, scenario, repetition, anchor, realm);
                  anchor = row.fixture.anchor;
                  realm = row.completion.realm;
                }
              }
            }
          }
          report.profileMemory.push({ tabs, ...await memory(chrome), workerHeap: await workerHeap(chrome) });
          await save();
        });
      }
      if (!values['skip-package']) {
        await profile('untouched-package', 20, async (chrome, fixture) => {
          const rules = ruleCounts.at(-1);
          await configure(fixture, origin, rules);
          let anchor;
          for (const scenario of scenarios) {
            const row = await sample(chrome, fixture, 'untouched-package', 20, rules, 'warm', scenario, 1, anchor);
            anchor = row.fixture.anchor;
          }
        });
      }
    }
    if (!values['skip-idle']) {
      for (let trial = 1; trial <= idleTrials; trial++) {
        const chrome = await launchBrowser(executable, packageDir, values.headed);
        try {
          const { targetInfos } = await chrome.browser.call('Target.getTargets');
          const target = targetInfos.find(target => target.type === 'page');
          assert.ok(target, 'initial ordinary browser page');
          const observer = await chrome.browser.attach(target.targetId);
          const lifecycle = await observeWorker(observer, chrome.extensionId);
          const options = await optionsPage(chrome);
          await configure({ options, ready: () => readStatus(options) }, origin, ruleCounts.at(-1));
          console.log(`Observing natural idle ${trial}/${idleTrials} with only a page-session ServiceWorker lifecycle observer`);
          report.browsers.push({ evidence: 'untouched-package idle', version: chrome.version });
          report.idle.push(await runIdle(chrome, { options, lifecycle }));
          await save();
        } finally {
          await chrome.close();
        }
      }
    }
    if (!values['idle-only']) {
      const expected = scales.length * ruleCounts.length * repetitions * scenarios.length * modes.length;
      assert.equal(report.samples.filter(sample => sample.evidence === 'copied-worker').length, expected);
    }
    report.complete = true;
  } catch (error) {
    report.failure = error.stack;
    throw error;
  } finally {
    await save();
    server.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 5 });
  }
  console.log(`Saved ${report.samples.length} samples to ${output}`);
}

await main();
