import { describe, expect, it } from 'vitest';
import { renderSubscriptionEmail } from '@/features/subscriptions/email';
describe('subscription email rendering', () => {
  it('renders a renewal nudge with the code and plans link', () => {
    const out = renderSubscriptionEmail('renewal_nudge', { locale: 'en', planName: 'The Classic', code: 'ROS10-ABCD', plansUrl: 'https://shop/en/cairo/subscriptions' });
    expect(out.text).toContain('ROS10-ABCD');
    expect(out.html).toContain('ROS10-ABCD');
    expect(out.html).toContain('subscriptions');
  });
  it('renders cancelled_credit with the gift card code', () => {
    const out = renderSubscriptionEmail('cancelled_credit', { locale: 'en', planName: 'The Classic', code: 'ROSC-5678', creditMinor: 60000 });
    expect(out.text).toContain('ROSC-5678');
  });
  it('escapes plan names', () => {
    const out = renderSubscriptionEmail('completed', { locale: 'en', planName: '<b>Classic</b>', code: '' });
    expect(out.html).not.toContain('<b>Classic</b>');
  });
});
