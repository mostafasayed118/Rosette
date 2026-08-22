// tests/components/OccasionForm.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OccasionForm } from '@/features/occasions/OccasionForm';
import { renderWithProviders } from '../test-utils';

describe('OccasionForm', () => {
  it('shows month and day fields for an annual occasion by default', () => {
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/month/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Day$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/date/i)).toBeNull();
  });

  it('swaps to a single date field when switching to one-off', async () => {
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: /once/i }));
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/month/i)).toBeNull();
  });

  it('submits an annual payload with the chosen lead time', async () => {
    const onSubmit = vi.fn().mockResolvedValue('saved');
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/who is it for/i), 'Mum');
    await userEvent.selectOptions(screen.getByLabelText(/month/i), '3');
    await userEvent.selectOptions(screen.getByLabelText(/^Day$/i), '14');
    await userEvent.click(screen.getByRole('radio', { name: '14' }));
    await userEvent.click(screen.getByRole('button', { name: /add a date/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      recipientName: 'Mum', recurrence: 'annual', month: 3, day: 14, leadDays: 14,
    }));
  });

  it('submits a one-off payload with eventDate and no month/day', async () => {
    const onSubmit = vi.fn().mockResolvedValue('saved');
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/who is it for/i), 'Youssef');
    await userEvent.click(screen.getByRole('radio', { name: /once/i }));
    await userEvent.type(screen.getByLabelText(/date/i), '2026-07-12');
    await userEvent.click(screen.getByRole('button', { name: /add a date/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({ recurrence: 'once', eventDate: '2026-07-12' });
    expect(payload.month).toBeUndefined();
    expect(payload.day).toBeUndefined();
  });

  it('surfaces a validation failure without clearing the form', async () => {
    const onSubmit = vi.fn().mockResolvedValue('invalid');
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/who is it for/i), 'Mum');
    await userEvent.click(screen.getByRole('button', { name: /add a date/i }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByLabelText(/who is it for/i)).toHaveValue('Mum');
  });
});
