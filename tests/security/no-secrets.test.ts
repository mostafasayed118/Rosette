import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ignored = new Set(['node_modules', '.next', '.open-next', '.wrangler', '.git', 'coverage']);
const secretPatterns = [/gsk_[A-Za-z0-9_-]{20,}/, /sk_(?:live|test)_[A-Za-z0-9]{12,}/, /service_role_[A-Za-z0-9_-]{12,}/, /GMAIL_APP_PASSWORD\s*=\s*[^\s<][^\n]{15,}/];

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return /\.(ts|tsx|js|mjs|json|md|env|sql|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('repository secret scan', () => {
  it('contains no obvious provider credential values', () => {
    const findings = filesIn(process.cwd()).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return secretPatterns.some((pattern) => pattern.test(content)) ? [file] : [];
    });
    expect(findings).toEqual([]);
  });
});
