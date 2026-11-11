import assert from 'node:assert/strict';

export function installProbe() {
  const apiMethods = {
    'action': ['setBadgeText', 'setTitle'],
    'contextMenus': ['create', 'update', 'remove', 'removeAll'],
    'runtime': ['sendMessage'],
    'storage.local': ['get', 'set', 'remove', 'clear'],
    'storage.session': ['get', 'set', 'remove', 'clear'],
    'tabGroups': ['get', 'query', 'update'],
    'tabs': ['get', 'query', 'move', 'group', 'ungroup', 'update', 'remove'],
    'webNavigation': ['getFrame'],
    'windows': ['get', 'getAll', 'getLastFocused', 'update'],
  };
  const realm = crypto.randomUUID();
  const realmStartedAt = performance.now();
  const counts = {};
  let lastApiCallAt = realmStartedAt;
  let indicatorRunning = false;
  const send = chrome.runtime.sendMessage.bind(chrome.runtime);
  for (const [namespace, methods] of Object.entries(apiMethods)) {
    const api = namespace.split('.').reduce((target, key) => target[key], chrome);
    for (const method of methods) {
      const original = api[method];
      if (typeof original !== 'function') throw new Error(`Missing Chrome API ${namespace}.${method}`);
      const key = `${namespace}.${method}`;
      api[method] = function (...args) {
        counts[key] = (counts[key] ?? 0) + 1;
        lastApiCallAt = performance.now();
        return Reflect.apply(original, api, args);
      };
      if (api[method] === original) throw new Error(`Cannot instrument ${key}`);
    }
  }

  const active = new Map();
  globalThis.__chromeReHomeBenchmark = {
    realm,
    indicatorActivity(active) { indicatorRunning = active; },
    settled() {
      if (indicatorRunning || performance.now() - lastApiCallAt < 30) return;
      return { realm, lastApiCallAt, calls: { ...counts } };
    },
    mark(tabId, stage, value) {
      const sample = active.get(tabId);
      if (sample) sample.stages[stage] = value;
    },
    async measure(input, handle) {
      if (input.frameId !== 0 || input.kind !== 'committed' || !/^http:\/\/127\.0\.0\.1:\d+\/benchmark\/sample\/\d+\/(?:no-match|group|replacement-background|replacement-foreground)$/.test(input.url)) {
        return handle(input);
      }
      const { tabId, documentId, kind, url, timeStamp } = input;
      const startedAt = performance.now();
      const baseline = { ...counts };
      const sample = { stages: {} };
      active.set(tabId, sample);
      try {
        await handle(input);
      } finally {
        const completedAt = performance.now();
        active.delete(tabId);
        const calls = Object.fromEntries(Object.entries(counts).flatMap(([key, count]) => {
          const delta = count - (baseline[key] ?? 0);
          return delta ? [[key, delta]] : [];
        }));
        // Capturing and delivering this test message occurs after the timed handler.
        void send({ chromeReHomeBenchmark: { realm, realmStartedAt, tabId, documentId, kind, url, timeStamp,
          startedAt, completedAt, ...sample, calls, realmCalls: { ...counts } } }).catch(() => {});
      }
    },
  };
}

function insertBefore(bundle, anchor, addition) {
  assert.equal(bundle.split(anchor).length, 2, `Expected exactly one bundle anchor: ${anchor}`);
  return bundle.replace(anchor, addition + anchor);
}

export function instrumentBundle(bundle) {
  // These anchors intentionally fail closed when a build changes the measured code.
  const registration = 'registerEvents(chrome, coordinator, reportFailure);';
  assert.equal(bundle.split(registration).length, 2, 'Expected exactly one production navigation registration');
  bundle = bundle.replace(registration, `registerEvents(chrome, {
    ...coordinator,
    handle: input => globalThis.__chromeReHomeBenchmark.measure(input, coordinator.handle),
  }, reportFailure);`);
  const indicatorStart = '    running = true;\n    void Promise.resolve().then(reconcile).catch';
  const indicatorStop = '      running = false;\n    }\n  }\n  function refresh()';
  const start = bundle.indexOf('// src/browser/protection-indicator.ts\n');
  const end = bundle.indexOf('\n// src/', start + 1);
  assert.ok(start >= 0 && end > start, 'Expected the production indicator module');
  let indicator = bundle.slice(start, end);
  indicator = insertBefore(indicator, indicatorStart, '    globalThis.__chromeReHomeBenchmark.indicatorActivity(true);\n');
  indicator = insertBefore(indicator, indicatorStop, '      globalThis.__chromeReHomeBenchmark.indicatorActivity(false);\n');
  bundle = bundle.slice(0, start) + indicator + bundle.slice(end);
  bundle = insertBefore(bundle, '    const view = tracker2.view();', '    globalThis.__chromeReHomeBenchmark.mark(event.tabId, "consume", true);\n');
  bundle = insertBefore(bundle, '    const identity = compileDuplicateRules(context.config.duplicateRules);',
    '    globalThis.__chromeReHomeBenchmark.mark(event.tabId, "rulesPerList", [context.config.groupingRules.length, context.config.duplicateRules.length]);\n    const probeCompileStarted = performance.now();\n');
  bundle = insertBefore(bundle, '    if (identity.kind !== "ready" || grouping.kind !== "ready") return;',
    '    globalThis.__chromeReHomeBenchmark.mark(event.tabId, "compileMs", performance.now() - probeCompileStarted);\n');
  bundle = insertBefore(bundle, '      const groupTitle = grouping.match(selection.winner.url)?.group;', '      const probeMatchStarted = performance.now();\n');
  bundle = insertBefore(bundle, '      const ids = [\n        selection.winner.id,',
    '      globalThis.__chromeReHomeBenchmark.mark(event.tabId, "groupMatchMs", performance.now() - probeMatchStarted);\n');
  bundle = insertBefore(bundle, '      if (plan.kind === "skip" || !guard.isCurrent()) return;',
    '      globalThis.__chromeReHomeBenchmark.mark(event.tabId, "plan", plan.kind === "skip" ? plan : { destination: plan.destination.kind, presentation: plan.presentation.kind, duplicates: plan.duplicates.length });\n');
  bundle = insertBefore(bundle, '        if (result.kind === "stopped") diagnostics2.record({ code: "operation-failed" });',
    '        globalThis.__chromeReHomeBenchmark.mark(event.tabId, "execution", { kind: result.kind, removed: result.removedTabIds.length });\n');
  return `(${installProbe.toString()})();\n${bundle}`;
}
