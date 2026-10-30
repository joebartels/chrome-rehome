import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function validReport() {
  return {
    config: { projects: ['portable', 'headed'].map(name => ({ name, retries: 0 })) },
    suites: [{ title: 'file', suites: [{ title: 'nested', specs: ['portable', 'headed'].map(projectName => ({
      title: projectName, ok: true, tests: [{ projectName, expectedStatus: 'passed', status: 'expected',
        results: [{ status: 'passed', retry: 0, errors: [] }] }],
    })) }] }],
    errors: [], stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 },
  };
}
type Report = ReturnType<typeof validReport>;
function run(report: unknown, projects = ['portable', 'headed'], raw = false) {
  const folder = mkdtempSync(join(tmpdir(), 'chromerehome-results-')); folders.push(folder);
  const path = join(folder, 'report.json');
  if (report !== undefined) writeFileSync(path, raw ? String(report) : JSON.stringify(report));
  const result = spawnSync(process.execPath, [resolve('scripts/check-browser-results.mjs'), path, ...projects], { encoding: 'utf8' });
  return { code: result.status, output: result.stdout + result.stderr };
}
function testResult(report: Report) { return report.suites[0]!.suites[0]!.specs[0]!.tests[0]!; }
describe('browser result CLI gate', () => {
  it('accepts nonempty nested portable and headed results passing exactly once', () => {
    const result = run(validReport()); expect(result.output).toContain('portable: 1 passed');
    expect(result.output).toContain('headed: 1 passed'); expect(result.code).toBe(0);
  });
  it.each([
    ['missing report', undefined], ['malformed JSON', '{broken'], ['null report', null],
    ['missing suites', {}], ['empty report', { suites: [], errors: [] }],
  ])('rejects %s clearly', (_name, report) => {
    const result = run(report, ['portable'], typeof report === 'string');
    expect(result.code).toBe(1); expect(result.output).toContain('Browser result check failed:');
  });
  it('rejects no requested projects', () => { expect(run(validReport(), []).code).toBe(1); });
  it('rejects unknown requested projects', () => { expect(run(validReport(), ['native-macos']).code).toBe(1); });
  it('rejects a configured project with zero selected tests', () => {
    const report = validReport(); report.suites[0]!.suites[0]!.specs.pop(); report.stats.expected = 1;
    const result = run(report); expect(result.code).toBe(1); expect(result.output).toContain('headed: selected zero tests');
  });
  it.each([
    ['skipped', (r: Report) => { testResult(r).results[0]!.status = 'skipped'; }],
    ['flaky', (r: Report) => { testResult(r).status = 'flaky'; }],
    ['unexpected', (r: Report) => { testResult(r).status = 'unexpected'; }],
    ['expected failure', (r: Report) => { testResult(r).expectedStatus = 'failed'; }],
    ['pending', (r: Report) => { testResult(r).results[0]!.status = 'interrupted'; }],
    ['no results', (r: Report) => { testResult(r).results = []; }],
    ['second attempt', (r: Report) => { testResult(r).results.push({ status: 'passed', retry: 1, errors: [] }); }],
    ['nonzero retry', (r: Report) => { testResult(r).results[0]!.retry = 1; }],
    ['configured retries', (r: Report) => { r.config.projects[0]!.retries = 1; }],
    ['global error', (r: Report) => { (r.errors as unknown[]).push({ message: 'worker crashed' }); }],
    ['test error', (r: Report) => { (testResult(r).results[0]!.errors as unknown[]).push({ message: 'error' }); }],
    ['global skipped count', (r: Report) => { r.stats.skipped = 1; }],
  ])('rejects %s', (_name, mutate) => {
    const report = validReport(); mutate(report); const result = run(report);
    expect(result.code).toBe(1); expect(result.output).toContain('Browser result check failed:');
  });
});
