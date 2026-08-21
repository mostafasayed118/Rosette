import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cloudflare Workers Free plan limit on the compressed worker script.
const LIMIT_BYTES = 3 * 1024 * 1024;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const worker = join(root, '.open-next', 'worker.js');
  if (!existsSync(worker)) {
    console.error('Missing .open-next/worker.js. Run the OpenNext build first.');
    process.exit(1);
  }

  // Wrangler's dry-run is the same measurement Cloudflare uses for the size
  // limit: it bundles the worker the way `wrangler deploy` would, then reports
  // the compressed upload size without actually deploying.
  let output;
  try {
    output = execFileSync('npx', ['--no-install', 'wrangler', 'deploy', '--dry-run'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error('Failed to measure worker size with wrangler:', error.stderr || error.message);
    process.exit(1);
  }

  const match = output.match(/gzip:\s*([\d.]+)\s*(KiB|MiB)/);
  if (!match) {
    console.error('Could not parse the compressed size from `wrangler deploy --dry-run`.');
    process.exit(1);
  }

  const value = Number(match[1]);
  const bytes = match[2] === 'MiB' ? value * 1024 * 1024 : value * 1024;

  console.log(`Worker upload gzip size: ${match[1]} ${match[2]}`);
  if (bytes > LIMIT_BYTES) {
    console.error('Worker exceeds the 3 MiB free-plan limit.');
    process.exit(1);
  }
}

main();
