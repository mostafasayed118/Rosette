import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GiftCardPurchaseForm } from '@/features/gift-cards/GiftCardPurchaseForm';

vi.mock('@/features/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));

describe('GiftCardPurchaseForm', () => {
  it('renders fixed amounts and the sender/recipient fields', () => {
    render(<GiftCardPurchaseForm cityCode="cairo" />);
    expect(screen.getByText('giftCardAmount')).toBeInTheDocument();
    expect(screen.getByLabelText('giftCardSenderEmail')).toBeInTheDocument();
    expect(screen.getByLabelText('giftCardRecipientEmail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buyGiftCard/i })).toBeInTheDocument();
  });
});
