import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DestinationGate } from '@/features/destination/DestinationGate';
import { renderWithProviders } from '../test-utils';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push }),
}));

describe('DestinationGate', () => {
  it('keeps the collection CTA disabled until a city is selected', () => {
    renderWithProviders(<DestinationGate locale="en" />);
    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();
    expect(continueButton).toHaveClass('disabled:bg-surface-container-high', 'disabled:text-on-surface-variant', 'disabled:opacity-100');
  });

  it('navigates to the localized city URL on selection', async () => {
    renderWithProviders(<DestinationGate locale="en" />);
    fireEvent.click(screen.getByLabelText(/city/i));
    fireEvent.click(await screen.findByRole('option', { name: /alexandria/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(push).toHaveBeenCalledWith('/en/alexandria');
  });

  it('keeps the destination form before the image on mobile and preserves image clarity in dark mode', () => {
    renderWithProviders(<DestinationGate locale="en" />);
    const heading = screen.getByRole('heading', { name: /choose where/i });
    const image = screen.getByRole('img');
    const content = heading.closest('div.md\\:col-span-5');
    const imageFrame = image.closest('div.md\\:col-span-5');

    expect(content).toHaveClass('order-2');
    expect(imageFrame).toHaveClass('order-1');
    expect(imageFrame).toHaveClass('aspect-[4/5]');
    expect(image).toHaveClass('dark:mix-blend-normal', 'dark:opacity-100');
  });
});
