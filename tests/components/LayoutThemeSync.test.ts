import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync('app/layout.tsx', 'utf8');

describe('root theme synchronization', () => {
  it('runs the theme sync script in the document head before body content', () => {
    const headStart = layout.indexOf('<head>');
    const bodyStart = layout.indexOf('<body>');
    const themeScript = layout.indexOf('dangerouslySetInnerHTML={{ __html: THEME_SYNC_SCRIPT }}');

    expect(headStart).toBeGreaterThan(-1);
    expect(bodyStart).toBeGreaterThan(headStart);
    expect(themeScript).toBeGreaterThan(headStart);
    expect(themeScript).toBeLessThan(bodyStart);
  });
});
