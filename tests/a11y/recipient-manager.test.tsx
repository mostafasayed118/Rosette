import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { RecipientGroupCard } from '@/features/cart/RecipientGroupCard';
import type { CartRecipient } from '@/features/cart/recipient-types';

const recipient: CartRecipient = {
  id: 'r1', label: 'For Mom', recipientName: 'Mom', recipientPhone: '01000000000',
  address: '1 Zamalek St', deliveryDate: '2026-09-02', deliveryWindow: '12-3',
};

function renderCard(props: Partial<Parameters<typeof RecipientGroupCard>[0]> = {}) {
  const defaults = {
    recipient,
    itemCount: 2,
    subtotalMinor: 3000,
    onRemove: () => {},
    onEdit: () => {},
  };
  render(<I18nProvider><RecipientGroupCard {...defaults} {...props} /></I18nProvider>);
}

describe('RecipientGroupCard', () => {
  it('renders the recipient label and delivery details', () => {
    renderCard();
    expect(screen.getByText('For Mom')).toBeTruthy();
    expect(screen.getByText(/Zamalek/)).toBeTruthy();
    expect(screen.getByText(/2 item/)).toBeTruthy();
  });

  it('renders the subtotal in EGP minor units', () => {
    renderCard({ subtotalMinor: 4500 });
    expect(screen.getByText(/EGP/)).toBeTruthy();
  });

  it('falls back to the recipient name when no label is set', () => {
    renderCard({ recipient: { ...recipient, label: undefined } });
    expect(screen.getByText('Mom')).toBeTruthy();
  });

  it('fires onRemove from the remove button', () => {
    const onRemove = vi.fn();
    renderCard({ itemCount: 0, subtotalMinor: 0, onRemove });
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('fires onEdit from the edit button', () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('renders nothing for a null recipient', () => {
    const { container } = render(<I18nProvider><RecipientGroupCard recipient={null} itemCount={0} subtotalMinor={0} onRemove={() => {}} onEdit={() => {}} /></I18nProvider>);
    expect(container.querySelector('[data-testid^="recipient-group-"]')).toBeNull();
  });
});