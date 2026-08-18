import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with the default variant classes and text', () => {
    render(<Button>Buy now</Button>);
    const btn = screen.getByRole('button', { name: 'Buy now' });
    expect(btn.className).toContain('bg-primary');
  });

  it('renders an outline variant when requested', () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('border-input');
  });
});
