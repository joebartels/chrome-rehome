import { build } from 'esbuild';
import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkSources } from './check-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
checkSources(root);
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/options/', import.meta.url), { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: { 'background/index': 'src/background/index.ts', 'options/index': 'src/options/index.ts' },
  outdir: 'dist', bundle: true, splitting: false, format: 'esm', platform: 'browser',
  target: 'chrome120', sourcemap: false, metafile: true, legalComments: 'none', charset: 'utf8',
});
for (const [source, destination] of [
  ['manifest.json', 'manifest.json'],
  ['src/options/index.html', 'options/index.html'],
  ['src/options/styles.css', 'options/styles.css'],
]) await copyFile(new URL(`../${source}`, import.meta.url), new URL(`../dist/${destination}`, import.meta.url));
await mkdir(new URL('../.build/', import.meta.url), { recursive: true });
await writeFile(new URL('../.build/metafile.json', import.meta.url), JSON.stringify(result.metafile, null, 2) + '\n');
console.log('Built Chrome 120 extension into dist/; dependency graph in .build/metafile.json');
