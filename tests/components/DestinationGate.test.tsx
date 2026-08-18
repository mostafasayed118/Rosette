import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DestinationGate } from '@/features/destination/DestinationGate';
import { renderWithProviders } from '../test-utils';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('DestinationGate', () => {
  it('navigates to the localized city URL on selection', async () => {
    renderWithProviders(<DestinationGate locale="en" />);
    fireEvent.click(screen.getByLabelText(/city/i));
    fireEvent.click(await screen.findByRole('option', { name: /alexandria/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(push).toHaveBeenCalledWith('/en/alexandria');
  });
});
