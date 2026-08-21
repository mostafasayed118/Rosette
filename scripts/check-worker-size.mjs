import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cloudflare Workers Free plan limit on the compressed worker script.
const LIMIT_BYTES = 3 * 1024 * 1024;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Resolve the locally installed wrangler binary. Calling it directly avoids
 * npx entirely, which is both faster and works on Windows where bare `npx`
 * is not an executable (it is `npx.cmd`).
 */
function resolveWranglerBin() {
  const binDir = join(root, 'node_modules', '.bin');
  const candidates = process.platform === 'win32'
    ? ['wrangler.cmd', 'wrangler.CMD', 'wrangler']
    : ['wrangler'];
  for (const candidate of candidates) {
    const full = join(binDir, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

function main() {
  const worker = join(root, '.open-next', 'worker.js');
  if (!existsSync(worker)) {
    console.error('Missing .open-next/worker.js. Run the OpenNext build first.');
    process.exit(1);
  }

  const wrangler = resolveWranglerBin();
  if (!wrangler) {
    console.error('Could not find the local wrangler binary in node_modules/.bin. Run `npm install` first.');
    process.exit(1);
  }

  // Wrangler's dry-run is the same measurement Cloudflare uses for the size
  // limit: it bundles the worker the way `wrangler deploy` would, then reports
  // the compressed upload size without actually deploying.
  let output;
  try {
    // On Windows the shim is a .cmd, which must be launched via cmd.exe. Passing
    // the shim as an argument (not through `shell: true`) keeps arguments escaped.
    const isWindowsShim = process.platform === 'win32' && wrangler.toLowerCase().endsWith('.cmd');
    output = isWindowsShim
      ? execFileSync(process.env.COMSPEC ?? 'cmd.exe', ['/d', '/s', '/c', wrangler, 'deploy', '--dry-run'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      : execFileSync(wrangler, ['deploy', '--dry-run'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message || '';
    if (/not logged in|authentication|CLOUDFLARE_API_TOKEN|login/i.test(detail)) {
      console.error('Wrangler needs Cloudflare credentials to bundle the worker. Set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) or run `wrangler login`, then re-run this check.');
      process.exit(1);
    }
    console.error('Failed to measure worker size with wrangler:', detail);
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
