import assert from 'node:assert/strict';
import { cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const { outputFiles: [bundle] } = await build({
  absWorkingDir: repo,
  stdin: {
    resolveDir: repo,
    contents: `
      export { selectCandidates } from './src/planning/candidates';
      export { compileDuplicateRules } from './src/rules/duplicates';
      export { compileGroupingRules } from './src/rules/grouping';
    `,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { selectCandidates, compileDuplicateRules, compileGroupingRules } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`
);

const sampleCount = 101;
const warmups = 30;
const origin = 'https://active.example';
const triggerURL = `${origin}/page/0?z=1&utm_source=bench&a=2`;

function measure(run, validate) {
  const samples = [];
  for (let index = 0; index < warmups + sampleCount; index++) {
    const start = performance.now();
    const result = run();
    const elapsed = performance.now() - start;
    validate(result);
    if (index >= warmups) samples.push(elapsed);
  }
  const sorted = samples.toSorted((left, right) => left - right);
  const percentile = rank => sorted[Math.ceil(rank * sorted.length) - 1];
  return { p50Ms: percentile(0.5), p95Ms: percentile(0.95), samplesMs: samples };
}

function ruleFixture(count) {
  const grouping = Array.from({ length: count }, (_, index) => ({
    enabled: true,
    pattern: index === count - 1 ? `${origin}/page/*` : `${origin}/other/${index}/*`,
    group: `Group ${index}`,
  }));
  const duplicates = Array.from({ length: count }, (_, index) => ({
    enabled: true,
    origin: index === count - 1 ? origin : `https://policy-${index}.example`,
    ignoreQueryParameters: ['utm_source'],
    ignoreFragment: true,
    ignoreTrailingSlash: true,
    sortQueryParameters: true,
  }));
  return { grouping, duplicates };
}

function candidateFixture(count) {
  const epoch = Symbol('phase benchmark');
  const trigger = { epoch, tabId: 0, generation: 1, observedSequence: 1, documentId: 'bench', url: triggerURL };
  const view = { epoch, revision: 1, navigations: [trigger], blockedTabIds: [] };
  const tabs = Array.from({ length: count }, (_, index) => ({
    id: index,
    windowId: Math.floor(index / 20),
    index: index % 20,
    groupId: -1,
    audible: false,
    incognito: false,
    pinned: false,
    url: `${origin}/page/${index}?z=1&utm_source=bench&a=2`,
  }));
  return { trigger, view, tabs };
}

const rows = [];
for (const rulesPerList of [0, 20, 100]) {
  const rules = ruleFixture(rulesPerList);
  const compile = () => [compileGroupingRules(rules.grouping), compileDuplicateRules(rules.duplicates)];
  const [grouping, identity] = compile();
  const compilation = measure(compile, ([grouping, duplicates]) => {
    assert.equal(grouping.kind, 'ready');
    assert.equal(duplicates.kind, 'ready');
  });
  const groupingMatch = measure(() => grouping.match(triggerURL), result => {
    assert.equal(result?.group, rulesPerList ? `Group ${rulesPerList - 1}` : undefined);
  });
  const candidateScan = [];
  for (const tabCount of [20, 200, 1000]) {
    const { trigger, view, tabs } = candidateFixture(tabCount);
    const result = measure(
      () => selectCandidates(trigger, tabs, view, identity, { allowNoDuplicates: true }),
      selection => {
        assert.equal(selection.kind, 'single');
        assert.equal(selection.winner.id, trigger.tabId);
      },
    );
    candidateScan.push({ tabCount, ...result });
  }
  rows.push({ rulesPerList, compilation, groupingMatch, candidateScan });
}

console.log(JSON.stringify({
  method: 'Node pure functions; last grouping rule match, no duplicate, shared origin with query normalization when rules are present',
  node: process.version,
  os: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model,
  sampleCount,
  warmups,
  rows,
}, null, 2));
