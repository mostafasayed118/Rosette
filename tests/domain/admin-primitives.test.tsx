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

  it('KeyValueRow renders label and value with documented classes', () => {
    render(<KeyValueRow label="Total" value={<strong>100</strong>} />);
    expect(screen.getByText('Total')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('100')).toHaveClass('text-foreground');
  });

  it('ImagePreview renders next/image with correct size for product kind', () => {
    render(<ImagePreview url="https://example.com/img.jpg" kind="product" />);
    const img = screen.getByRole('img', { name: '' });
    expect(img).toHaveAttribute('width', '96');
    expect(img).toHaveAttribute('height', '96');
    expect(img).toHaveClass('rounded-md', 'object-cover');
  });

  it('ImagePreview renders fallback chip for avatar kind without url', () => {
    render(<ImagePreview url="" kind="avatar" fallback="JD" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('RequestTabs renders tab triggers wired to links', () => {
    render(<RequestTabs basePath="/admin/reviews" tabs={[{ value: 'pending', label: 'Pending' }]} current="pending" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
