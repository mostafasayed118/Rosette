import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionsPanel } from '@/features/subscriptions/SubscriptionsPanel';
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@/features/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
const items = [{ id: 's1', planNameEn: 'The Classic', status: 'active', frequency: 'weekly', bundleSize: 4, priceMinor: 120000, firstDeliveryDate: '2026-09-15', orderedCount: 1 }];
describe('SubscriptionsPanel', () => {
  it('renders plan name and progress', () => {
    render(<SubscriptionsPanel items={items} accountPath="/en/cairo/account" />);
    expect(screen.getByText('The Classic')).toBeTruthy();
    expect(screen.getByText('1 of 4')).toBeTruthy();
  });
});
