import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ProfileForm } from '@/components/account/ProfileForm';
import { EmailPreferences } from '@/components/account/EmailPreferences';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getEngagementPreference } from '@/features/email-preferences/preferences-service';
import { signOutCustomer } from '@/features/account/actions';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getServerT } from '@/features/i18n/server';

export default async function AccountProfilePage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale: routeLocale, city } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${routeLocale}/${city}/account/login`);
  const { t } = await getServerT(routeLocale);
  const accountPath = `/${routeLocale}/${city}/account`;
  let preference: Awaited<ReturnType<typeof getEngagementPreference>> = { status: 'error' };
  try {
    preference = await getEngagementPreference(getAdminSupabase(), customer.email);
  } catch {
    preference = { status: 'error' };
  }
  return (
    <section className="grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm">
      <div>
        <p className="text-sm text-muted-foreground">{customer.email}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-[.95] tracking-[-.02em]">{t('profile')}</h1>
      </div>
      <ProfileForm initialName={customer.displayName} initialPhone={customer.phone} accountPath={accountPath} />
      <EmailPreferences initialEnabled={preference.status === 'enabled'} loadFailed={preference.status === 'error'} accountPath={accountPath} />
      <form action={signOutCustomer}>
        <input type="hidden" name="accountPath" value={accountPath} />
        <Button type="submit" variant="outline" size="sm">{t('signOut')}</Button>
      </form>
    </section>
  );
}
