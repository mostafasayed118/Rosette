import { execSync, spawn } from 'node:child_process';
import { E2E_PORT, getBaseUrl, setBaseUrl } from './base-url';

let child: ReturnType<typeof spawn> | null = null;

async function isServerUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/en/cairo`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    if (await isServerUp(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Next dev server did not become ready at ${url}: ${String(lastError)}`);
}

export async function setup(): Promise<void> {
  const candidates = [
    process.env.E2E_BASE_URL,
    `http://localhost:${E2E_PORT}`,
    getBaseUrl(),
    'http://localhost:3000',
  ].filter((url): url is string => Boolean(url));

  for (const candidate of candidates) {
    if (await isServerUp(candidate)) {
      setBaseUrl(candidate);
      return;
    }
  }

  const spawnedUrl = `http://127.0.0.1:${E2E_PORT}`;
  child = spawn('npm', ['run', 'dev', '--', '--port', String(E2E_PORT), '--hostname', '127.0.0.1'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    shell: true,
    detached: false,
  });
  await waitForServer(spawnedUrl);
  setBaseUrl(spawnedUrl);
}

export async function teardown(): Promise<void> {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // already gone
    }
  } else {
    child.kill('SIGTERM');
  }
  child = null;
}
