import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { OccasionList } from '@/features/occasions/OccasionList';
import { renderWithProviders } from '../test-utils';

const annual = {
  id: 'occ-1', recipientId: 'rec-1', recipientName: 'Mum', relationship: 'mother',
  kind: 'birthday', recurrence: 'annual' as const, month: 3, day: 14, eventDate: null,
  leadDays: 7, active: true,
};

const once = {
  id: 'occ-2', recipientId: 'rec-2', recipientName: 'Youssef', relationship: null,
  kind: 'graduation', recurrence: 'once' as const, month: null, day: null,
  eventDate: '2026-07-12', leadDays: 14, active: true,
};

describe('OccasionList', () => {
  it('renders a composed empty state rather than bare text', () => {
    renderWithProviders(<OccasionList occasions={[]} onRemove={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText(/no dates saved yet/i)).toBeInTheDocument();
    expect(screen.getByText(/add a birthday or anniversary/i)).toBeInTheDocument();
  });

  it('shows the recipient, relationship and recurrence for each row', () => {
    renderWithProviders(<OccasionList occasions={[annual, once]} onRemove={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText('Mum')).toBeInTheDocument();
    expect(screen.getByText(/mother/i)).toBeInTheDocument();
    expect(screen.getByText(/annual/i)).toBeInTheDocument();
    expect(screen.getByText(/once/i)).toBeInTheDocument();
  });

  it('shows the lead time for each row', () => {
    renderWithProviders(<OccasionList occasions={[annual]} onRemove={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText(/remind 7 days before/i)).toBeInTheDocument();
  });

  it('renders a remove control per occasion', () => {
    renderWithProviders(<OccasionList occasions={[annual, once]} onRemove={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);
  });

  it('renders an edit control per occasion', () => {
    renderWithProviders(<OccasionList occasions={[annual, once]} onRemove={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(2);
  });
});
