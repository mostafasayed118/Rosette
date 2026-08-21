import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Cloudflare deployment configuration', () => {
  it('defines a Workers config with no secret values', async () => {
    const config = await readFile('wrangler.jsonc', 'utf8');
    expect(config).toContain('main');
    expect(config).toContain('workers_dev');
    expect(config).toContain('nodejs_compat');
    expect(config).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|PAYMOB_API_KEY|PAYMOB_HMAC_SECRET|GMAIL_APP_PASSWORD/);
  });

  it('defines cf build and deploy scripts without Fly references', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['cf:build']).toBeTruthy();
    expect(pkg.scripts['cf:deploy']).toBeTruthy();
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/fly/);
  });

  it('has no Next.js Node middleware (unsupported on Cloudflare)', () => {
    for (const name of ['proxy.ts', 'proxy.js', 'middleware.ts', 'middleware.js']) {
      expect(existsSync(name)).toBe(false);
    }
  });

  it('declares non-secret mode vars for the Worker runtime', async () => {
    const config = await readFile('wrangler.jsonc', 'utf8');
    expect(config).toContain('"DEPLOYMENT_RUNTIME": "cloudflare"');
    expect(config).toContain('"PAYMENT_MODE": "cod"');
    expect(config).toContain('"EMAIL_DELIVERY_MODE": "disabled"');
  });

  it('keeps server secrets out of the deploy workflow build env', async () => {
    const workflow = await readFile('.github/workflows/deploy-cloudflare.yml', 'utf8');
    // Public build-time values may be injected for the client bundle...
    expect(workflow).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(workflow).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    // ...but server-only secrets must not be referenced in the workflow.
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'PAYMOB_API_KEY', 'PAYMOB_HMAC_SECRET', 'GMAIL_APP_PASSWORD', 'EMAIL_PREFERENCES_SECRET', 'GIFT_CARD_SECRET', 'CRON_SECRET']) {
      expect(workflow).not.toContain(name);
    }
    // No Fly commands anywhere.
    expect(workflow).not.toMatch(/flyctl|fly deploy|fly\.toml/);
    expect(workflow).toContain('npm run cf:build');
    expect(workflow).toContain('npx --no-install wrangler deploy');
  });
});
