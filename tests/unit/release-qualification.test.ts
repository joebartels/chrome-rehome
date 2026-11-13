import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function qualify(baselineVersion: unknown, candidateVersion: unknown, candidateFields = {}, binaryVersion = '130.0.4.7') {
  const folder = mkdtempSync(join(tmpdir(), 'chromerehome-qualification-'));
  folders.push(folder);
  const baseline = join(folder, 'baseline');
  const candidate = join(folder, 'candidate');
  const evidence = join(folder, 'evidence.json');
  const browser = join(folder, 'chrome');
  const probeMarker = join(folder, 'browser-probed');
  for (const [directory, version, fields] of [[baseline, baselineVersion, {}], [candidate, candidateVersion, candidateFields]] as const) {
    const manifest = {
      manifest_version: 3, name: 'Qualification fixture', version, minimum_chrome_version: '120',
      background: { service_worker: 'worker.js' }, options_ui: { page: 'settings.html' },
      action: { default_popup: 'panel.html' }, ...fields,
    };
    mkdirSync(directory);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
    for (const file of ['worker.js', 'settings.html', 'panel.html']) writeFileSync(join(directory, file), '');
  }
  // Provide only a version probe. The tests exercise CLI preflight and never load an extension.
  writeFileSync(browser, `#!/bin/sh
touch "$(dirname "$0")/browser-probed"
if [ "$#" -ne 1 ] || [ "$1" != --version ]; then exit 99; fi
printf '%s\\n' 'Chrome for Testing ${binaryVersion}'
`, { mode: 0o700 });
  const result = spawnSync(process.execPath, [resolve('tests/release/qualify.mjs'), browser, baseline, candidate, evidence, browser], {
    encoding: 'utf8', timeout: 3000,
  });
  return {
    code: result.status, error: result.stderr, probed: existsSync(probeMarker),
    report: existsSync(evidence) ? JSON.parse(readFileSync(evidence, 'utf8')) : undefined,
  };
}

it.each([
  ['1.2.3', '1.2.3'], ['1.2.3', '1.2.3.0'], ['2.0', '1.99.9'],
])('rejects candidate %s → %s before invoking Chrome', (baseline, candidate) => {
  const result = qualify(baseline, candidate);
  expect(result.code).toBe(1);
  expect(result.error).toMatch(/candidate version .* must be newer than baseline version/i);
  expect(result.probed).toBe(false);
});

it.each([
  ['baseline', '1.02.3', '2'], ['candidate', '1', '2.0.65536'], ['candidate', '1', '0.0'],
  ['candidate', '1', '2.0.0.0.0'], ['candidate', '1', 2], ['candidate', '1', undefined],
])('rejects an invalid %s manifest version before invoking Chrome (%s → %s)', (label, baseline, candidate) => {
  const result = qualify(baseline, candidate);
  expect(result.code).toBe(1);
  expect(result.error).toMatch(new RegExp(`${label} manifest.*version`, 'i'));
  expect(result.probed).toBe(false);
});

it('records the manifest inputs for a numerically newer package and rejects a browser below its minimum', () => {
  const result = qualify('2.9.99.5', '2.10', {
    name: 'Renamed fixture', minimum_chrome_version: '130.0.4.8', version_name: '2.10 release',
  });
  expect(result.code).toBe(1);
  expect(result.probed).toBe(true);
  expect(result.error).toMatch(/Chrome 130\.0\.4\.7 is below candidate minimum_chrome_version 130\.0\.4\.8/i);
  expect(result.report).toMatchObject({
    packages: {
      baseline: { name: 'Qualification fixture', version: '2.9.99.5', displayVersion: '2.9.99.5' },
      candidate: { name: 'Renamed fixture', version: '2.10', displayVersion: '2.10 release',
        workerPath: 'worker.js', optionsPage: 'settings.html', popupPage: 'panel.html' },
    },
    checks: [],
  });
});
