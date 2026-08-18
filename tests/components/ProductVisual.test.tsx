import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductVisual } from '@/components/ui/ProductVisual';

vi.mock('next/image', () => ({
  default: ({ src, alt, fill, sizes, priority, className, ...rest }: any) => (
    <img src={src} alt={alt} className={className} {...rest} />
  ),
}));

describe('ProductVisual', () => {
  it('renders the photo with alt text when imageUrl is provided', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour photo" imageUrl="https://example.com/rose.jpg" />);
    const img = screen.getByRole('img', { name: 'Rose Hour photo' });
    expect(img).toHaveAttribute('src', 'https://example.com/rose.jpg');
  });

  it('renders the placeholder when imageUrl is null', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour visual" />);
    const visual = screen.getByRole('img', { name: 'Rose Hour visual' });
    expect(visual.querySelector('.visual-bloom')).toBeInTheDocument();
    expect(visual.querySelector('img')).not.toBeInTheDocument();
  });
});
