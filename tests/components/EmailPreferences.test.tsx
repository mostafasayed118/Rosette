import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { EmailPreferences } from '@/components/account/EmailPreferences';

const setPreference = vi.hoisted(() => vi.fn());
vi.mock('@/features/account/actions', () => ({ setEmailEngagementPreference: setPreference }));

beforeEach(() => {
  setPreference.mockReset().mockResolvedValue('saved');
});

describe('EmailPreferences', () => {
  it('renders the current state and saves a toggle change', async () => {
    renderWithProviders(<EmailPreferences initialEnabled={true} />);
    const checkbox = screen.getByRole('checkbox', { name: /email preferences/i });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(setPreference).toHaveBeenCalledWith(false, undefined, undefined);
    expect(await screen.findByText(/email preferences updated/i)).toBeTruthy();
  });

  it('renders an error when the save fails', async () => {
    setPreference.mockResolvedValue('failure');
    renderWithProviders(<EmailPreferences initialEnabled={true} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /email preferences/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not update email preferences/i);
  });

  it('disables the control when the initial preference read failed', () => {
    renderWithProviders(<EmailPreferences initialEnabled={true} loadFailed />);
    expect(screen.getByRole('checkbox', { name: /email preferences/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not update email preferences/i);
  });
});
