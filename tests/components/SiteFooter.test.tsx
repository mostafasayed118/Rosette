import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteFooter } from '@/components/layout/SiteFooter';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo',
}));

import { renderWithProviders } from '../test-utils';

describe('SiteFooter', () => {
  it('renders the Stitch link columns with real targets', () => {
    renderWithProviders(<SiteFooter locale="en" city="greater-cairo" />);
    expect(screen.getByRole('link', { name: 'City Selector' })).toHaveAttribute('href', '/en');
    expect(screen.getByRole('link', { name: 'Gift Services' })).toHaveAttribute('href', '/en/greater-cairo/gift-cards');
    expect(screen.getByRole('link', { name: 'Shipping Policy' })).toHaveAttribute('href', '/en/greater-cairo/delivery');
    expect(screen.getByRole('link', { name: 'Track order' })).toHaveAttribute('href', '/en/greater-cairo/track');
    expect(screen.getByRole('link', { name: 'Our Story' })).toHaveAttribute('href', '/en/greater-cairo/about');
    expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/en/greater-cairo/contact');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/en/greater-cairo/privacy');
  });

  it('renders the brand column with copyright', () => {
    renderWithProviders(<SiteFooter locale="en" city="greater-cairo" />);
    expect(screen.getByText('Rosette')).toBeInTheDocument();
    expect(screen.getByText(/Rosette Atelier\. Crafted in Cairo\./)).toBeInTheDocument();
  });
});
