import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: '--font-display __variable_fraunces' }),
  Inter: () => ({ variable: '--font-body __variable_inter' }),
  Cairo: () => ({ variable: '--font-arabic __variable_cairo' }),
}));

import RootLayout from '@/app/layout';

describe('RootLayout fonts', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('class');
    document.body.innerHTML = '';
  });

  it('applies the font variable classes to the html element', () => {
    render(<RootLayout><div>child</div></RootLayout>);
    expect(document.documentElement.className).toContain('__variable_fraunces');
    expect(document.documentElement.className).toContain('__variable_inter');
    expect(document.documentElement.className).toContain('__variable_cairo');
  });
});
