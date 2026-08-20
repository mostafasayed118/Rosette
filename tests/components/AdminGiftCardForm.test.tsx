import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminGiftCardForm } from '@/features/gift-cards/AdminGiftCardForm';

vi.mock('@/features/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));

describe('AdminGiftCardForm', () => {
  it('renders amount controls and recipient fields without a plaintext code field', () => {
    render(<AdminGiftCardForm />);
    fireEvent.click(screen.getByText('giftCardCustom'));
    expect(screen.getByLabelText('giftCardCustomAmount')).toBeInTheDocument();
    expect(screen.getByLabelText('giftCardRecipientEmail')).toBeInTheDocument();
    expect(screen.queryByLabelText('giftCardCode')).not.toBeInTheDocument();
  });
});
