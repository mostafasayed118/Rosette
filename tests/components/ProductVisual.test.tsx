import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductVisual } from '@/components/ui/ProductVisual';

describe('ProductVisual', () => {
  it('renders the photo when imageUrl is provided', () => {
    const { container } = render(<ProductVisual tone="#c2456d" label="Rose Hour photo" imageUrl="https://example.com/rose.jpg" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/rose.jpg');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders the placeholder when imageUrl is null', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour visual" />);
    const visual = screen.getByRole('img', { name: 'Rose Hour visual' });
    expect(visual.querySelector('.visual-bloom')).toBeInTheDocument();
    expect(visual.querySelector('img')).not.toBeInTheDocument();
  });
});
