import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AuthorByline } from '@/components/blog/AuthorByline';
import { renderWithProviders } from '../test-utils';
import type { Author } from '@/features/blog/types';

const author: Author = {
  id: 'a1',
  slug: 'nour-hassan',
  nameEn: 'Nour Hassan',
  nameAr: 'نور حسن',
  roleEn: 'Founder & head florist',
  roleAr: 'المؤسِّسة ورئيسة الزهور',
  bioEn: 'Nour founded Rosette.',
  bioAr: 'أسّست نور روزيت.',
  avatarUrl: 'https://example.com/nour.jpg',
};

describe('AuthorByline', () => {
  it('renders nothing when there is no author', () => {
    const { container } = renderWithProviders(<AuthorByline author={null} locale="en" city="greater-cairo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the author page for the locale and city', () => {
    renderWithProviders(<AuthorByline author={author} locale="en" city="greater-cairo" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/en/greater-cairo/blog/authors/nour-hassan');
  });

  it('renders the localized name, role, and bio for English', () => {
    renderWithProviders(<AuthorByline author={author} locale="en" city="greater-cairo" />);
    expect(screen.getByText('Nour Hassan')).toBeInTheDocument();
    expect(screen.getByText('Founder & head florist')).toBeInTheDocument();
    expect(screen.getByText('Nour founded Rosette.')).toBeInTheDocument();
  });

  it('renders the localized name, role, and bio for Arabic', () => {
    renderWithProviders(<AuthorByline author={author} locale="ar" city="greater-cairo" />);
    expect(screen.getByText('نور حسن')).toBeInTheDocument();
    expect(screen.getByText('المؤسِّسة ورئيسة الزهور')).toBeInTheDocument();
    expect(screen.getByText('أسّست نور روزيت.')).toBeInTheDocument();
  });

  it('falls back to English when a locale field is missing', () => {
    renderWithProviders(<AuthorByline author={author} locale="fr" city="greater-cairo" />);
    expect(screen.getByText('Nour Hassan')).toBeInTheDocument();
  });

  it('renders the avatar image with explicit dimensions when a URL is present', () => {
    const { container } = renderWithProviders(<AuthorByline author={author} locale="en" city="greater-cairo" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // next/image rewrites src through the optimizer, so assert the source is referenced.
    expect(img?.getAttribute('src')).toContain(encodeURIComponent('https://example.com/nour.jpg'));
    expect(img).toHaveAttribute('width', '48');
    expect(img).toHaveAttribute('height', '48');
  });

  it('renders an initials circle when there is no avatar', () => {
    const minimal: Author = { id: 'a2', slug: 'rosette-studio', nameEn: 'The Rosette Studio' };
    const { container } = renderWithProviders(<AuthorByline author={minimal} locale="en" city="greater-cairo" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('hides role and bio when they are missing', () => {
    const minimal: Author = { id: 'a2', slug: 'rosette-studio', nameEn: 'The Rosette Studio' };
    renderWithProviders(<AuthorByline author={minimal} locale="en" city="greater-cairo" />);
    expect(screen.getByText('The Rosette Studio')).toBeInTheDocument();
    expect(screen.queryByText(/Founder|Nour founded/)).not.toBeInTheDocument();
  });
});
