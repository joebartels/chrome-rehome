import { readFileSync } from 'node:fs';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function collect(suites) {
  requireValue(Array.isArray(suites), 'report suites must be an array');
  return suites.flatMap(suite => {
    requireValue(suite && typeof suite === 'object', 'invalid suite');
    const specs = suite.specs ?? [];
    requireValue(Array.isArray(specs), 'suite specs must be an array');
    const tests = specs.flatMap(spec => {
      requireValue(spec && Array.isArray(spec.tests), 'spec tests must be an array');
      requireValue(spec.ok === true, `spec did not pass: ${spec.title ?? '(untitled)'}`);
      return spec.tests;
    });
    return [...tests, ...collect(suite.suites ?? [])];
  });
}
try {
  const [path, ...projects] = process.argv.slice(2);
  requireValue(path && projects.length > 0, 'usage: node scripts/check-browser-results.mjs REPORT_JSON PROJECT...');
  requireValue(new Set(projects).size === projects.length, 'requested project names must be unique');
  const report = JSON.parse(readFileSync(path, 'utf8'));
  requireValue(report && typeof report === 'object', 'report must be an object');
  requireValue(Array.isArray(report.errors) && report.errors.length === 0, 'report has errors or missing errors array');
  requireValue(report.stats && report.stats.unexpected === 0 && report.stats.flaky === 0 && report.stats.skipped === 0,
    'report contains unexpected, flaky or skipped tests, or missing stats');
  requireValue(Array.isArray(report.config?.projects), 'report is missing project configuration');
  const tests = collect(report.suites);
  requireValue(report.stats.expected === tests.length, 'expected count does not match selected tests');
  for (const test of tests) {
    requireValue(test && typeof test.projectName === 'string', 'test has no project name');
    requireValue(test.expectedStatus === 'passed' && test.status === 'expected', `${test.projectName}: test was not an expected pass`);
    requireValue(Array.isArray(test.results) && test.results.length === 1, `${test.projectName}: test must run exactly once`);
    const result = test.results[0];
    requireValue(result.status === 'passed' && result.retry === 0, `${test.projectName}: result did not pass with retry 0`);
    requireValue(Array.isArray(result.errors) && result.errors.length === 0 && !result.error, `${test.projectName}: result has errors`);
  }
  for (const project of projects) {
    const configured = report.config.projects.filter(entry => entry.name === project);
    requireValue(configured.length === 1 && configured[0].retries === 0, `${project}: project missing or retries are not 0`);
    const count = tests.filter(test => test.projectName === project).length;
    requireValue(count > 0, `${project}: selected zero tests`);
    console.log(`${project}: ${count} passed, 0 skipped, 0 retries`);
  }
} catch (error) {
  console.error(`Browser result check failed: ${error.message}`);
  process.exitCode = 1;
}
