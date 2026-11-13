import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const config = fileURLToPath(new URL('../.gitleaks.toml', import.meta.url));
const scanner = process.env.GITLEAKS_BIN || 'gitleaks';

function scan(options) {
  const result = spawnSync(scanner, [
    'git', '--config', config, '--redact=100', '--no-banner', '--no-color',
    '--ignore-gitleaks-allow', ...options, '.',
  ], { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') {
    throw new Error('Install Gitleaks and put it on PATH, or set GITLEAKS_BIN to its executable path.');
  }
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Gitleaks terminated by ${result.signal}.`);
  return result.status;
}

try {
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim();
  if (shallow === 'true') {
    throw new Error('Fetch the full Git history before scanning (git fetch --unshallow).');
  }
  console.log('Scanning reachable Git history.');
  const history = scan(['--log-opts=--all --full-history --diff-merges=first-parent --no-ext-diff --no-textconv']);
  console.log('Scanning staged changes.');
  const staged = scan(['--staged']);
  process.exitCode = history || staged;
} catch (error) {
  console.error(`Secret check failed: ${error.message}`);
  process.exitCode = 1;
}
