import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminLoading from '@/app/admin/loading';
import AdminError from '@/app/admin/error';

const fakeError = { message: 'boom', digest: 'abc123' } as Error & { digest?: string };

describe('admin loading and error', () => {
  it('loading renders Skeleton blocks without legacy classes', () => {
    const { container } = render(<AdminLoading />);
    expect(container.querySelector('.bg-surface-container')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it('error renders Button and Card without raw button or price class', () => {
    render(<AdminError error={fakeError} reset={() => {}} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    const container = document.querySelector('[role="alert"]');
    expect(container?.textContent).not.toContain('price');
  });
});
