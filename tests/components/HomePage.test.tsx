import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '@/app/page';
import { CartProvider } from '@/features/cart/CartProvider';
import { writeDestination } from '@/features/destination/storage';
import { renderWithProviders } from '../test-utils';

describe('HomePage destination reset', () => {
  it('clears the saved destination when the header reset is clicked', async () => {
    writeDestination({ countryCode: 'EG', cityCode: 'alexandria' });
    renderWithProviders(<CartProvider><HomePage /></CartProvider>);

    await waitFor(() => expect(screen.getByRole('button', { name: /delivering to alexandria/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /delivering to alexandria/i }));

    expect(window.localStorage.getItem('rosette.destination.v1')).toBeNull();
  });
});
