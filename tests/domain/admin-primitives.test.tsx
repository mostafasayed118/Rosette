import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '@/components/admin/PageHeader';
import { KeyValueRow } from '@/components/admin/KeyValueRow';
import { ImagePreview } from '@/components/admin/ImagePreview';
import { RequestTabs } from '@/components/admin/RequestTabs';

describe('admin primitives', () => {
  it('PageHeader renders eyebrow, title, description, and actions', () => {
    render(<PageHeader eyebrow="Ops" title="Products" description="Manage catalog" actions={<button>New</button>} />);
    expect(screen.getByText('Ops')).toHaveClass('text-sage');
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Manage catalog')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('PageHeader omits description and actions when not provided', () => {
    render(<PageHeader eyebrow="Ops" title="Products" />);
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('PageHeader omits the eyebrow <p> when eyebrow is an empty string', () => {
    const { container } = render(<PageHeader eyebrow="" title="Order #1234" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Order #1234' })).toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
  });

  it('KeyValueRow renders label and value with documented classes', () => {
    const { container } = render(<KeyValueRow label="Total" value={<strong>100</strong>} />);
    expect(screen.getByText('Total')).toHaveClass('text-muted-foreground');
    const dd = container.querySelector('dd');
    expect(dd).not.toBeNull();
    expect(dd).toHaveClass('text-end', 'text-foreground');
    expect(dd?.querySelector('strong')).toHaveTextContent('100');
  });

  it('ImagePreview renders next/image with correct size for product kind', () => {
    const { container } = render(<ImagePreview url="https://example.com/img.jpg" kind="product" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('width', '96');
    expect(img).toHaveAttribute('height', '96');
    expect(img).toHaveClass('rounded-md', 'object-cover');
    expect(img).toHaveAttribute('alt', '');
  });

  it('ImagePreview renders fallback chip for avatar kind without url', () => {
    render(<ImagePreview url="" kind="avatar" fallback="JD" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('RequestTabs renders tab triggers wired to links', () => {
    const { container } = render(<RequestTabs basePath="/admin/reviews" tabs={[{ value: 'pending', label: 'Pending' }]} current="pending" />);
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/admin/reviews?status=pending');
    expect(link).toHaveTextContent('Pending');
  });
});
