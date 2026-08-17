import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DestinationGate } from '@/features/destination/DestinationGate';
import { renderWithProviders } from '../test-utils';

describe('DestinationGate', () => {
  it('selects Alexandria and persists the chosen destination', () => {
    const onSelected = vi.fn();
    renderWithProviders(<DestinationGate onSelected={onSelected} />);

    fireEvent.change(screen.getByLabelText(/city/i), {
      target: { value: 'alexandria' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSelected).toHaveBeenCalledWith({
      countryCode: 'EG',
      cityCode: 'alexandria',
    });
    expect(window.localStorage.getItem('rosette.destination.v1')).toContain('alexandria');
  });
});
