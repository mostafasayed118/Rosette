import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GiftFinderQuiz } from '@/features/gift-finder/GiftFinderQuiz';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { CartProvider } from '@/features/cart/CartProvider';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';

const mocks = vi.hoisted(() => ({ completeGiftFinder: vi.fn() }));
vi.mock('@/features/gift-finder/actions', () => ({ completeGiftFinder: mocks.completeGiftFinder }));
vi.mock('next/navigation', () => ({ usePathname: () => '/en/cairo/gift-finder', useParams: () => ({ locale: 'en', city: 'cairo' }), useRouter: () => ({ push: vi.fn() }) }));

describe('GiftFinderQuiz', () => {
  it('walks through the questions and shows results on completion', async () => {
    mocks.completeGiftFinder.mockResolvedValue({ status: 'ok', results: [{ product: { slug: 'red-rose', name: 'Red Rose', description: '', category: 'hand-bouquet', occasions: ['love'], price: 14000, tone: '#c2185b', imageUrl: null, inventory: 5, delivery: 'Next-day', createdAt: '2026-01-01', variants: [], addOns: [] }, reasons: ['recipient'] }] });
    render(<I18nProvider initialLocale="en"><CartProvider><WishlistProvider><GiftFinderQuiz /></WishlistProvider></CartProvider></I18nProvider>);
    await screen.findByText(/find the perfect bouquet/i);
    const user = userEvent.setup();
    await user.click(screen.getByText('Start the quiz'));
    await screen.findByText(/who's it for/i);
    // The quiz auto-advances on selection; each step transition is animated,
    // so await the next question's options before clicking.
    await user.click(await screen.findByText('A partner'));
    await user.click(await screen.findByText('Celebration')); // EN value of the `celebration` key (the birthday occasion)
    await user.click(await screen.findByText('EGP 150–250'));
    await user.click(await screen.findByText('Red'));
    await user.click(await screen.findByText('Romantic'));
    await waitFor(() => expect(mocks.completeGiftFinder).toHaveBeenCalled());
    expect(await screen.findByText('Red Rose')).toBeInTheDocument();
  });
});
