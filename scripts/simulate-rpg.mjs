import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// esbuild is supplied by the existing Vite toolchain; no simulation dependency.
const temporary = await mkdtemp(join(tmpdir(), 'fatebook-balance-'));
try {
  const output = join(temporary, 'simulation.mjs');
  const sourceHashes = {};
  await build({ entryPoints: [fileURLToPath(new URL('./rpg-balance.ts', import.meta.url))], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent', plugins: [{ name: 'record-executed-sources', setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      const contents = await readFile(path, 'utf8');
      sourceHashes[relative(process.cwd(), path)] = createHash('sha256').update(contents).digest('hex');
      return { contents, loader: 'ts' };
    });
  } }] });
  const { main } = await import(pathToFileURL(output).href);
  await main(process.argv.slice(2), sourceHashes);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
