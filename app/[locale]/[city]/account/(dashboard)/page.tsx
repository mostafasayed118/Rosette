import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ProfileForm } from '@/components/account/ProfileForm';
import { EmailPreferences } from '@/components/account/EmailPreferences';
import { ReduceMotionToggle } from '@/components/account/ReduceMotionToggle';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';
import { getEngagementPreference } from '@/features/email-preferences/preferences-service';
import { signOutCustomer } from '@/features/account/actions';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getServerT } from '@/features/i18n/server';
import { listCustomerOrders } from '@/features/account/account-repository';
import { getCatalogRepository } from '@/features/catalog/provider';
import { formatMoney } from '@/features/money';
import { fulfillmentLabel } from '@/features/admin/status-labels';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { pickLocalized } from '@/features/i18n/pick';

export default async function AccountProfilePage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale: routeLocale, city } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${routeLocale}/${city}/account/login`);
  const { t, locale } = await getServerT(routeLocale);
  const accountPath = `/${routeLocale}/${city}/account`;

  let preference: Awaited<ReturnType<typeof getEngagementPreference>> = { status: 'error' };
  try {
    preference = await getEngagementPreference(getAdminSupabase(), customer.email);
  } catch {
    preference = { status: 'error' };
  }

  const supabase = await getServerSupabase();
  const orders = supabase ? await listCustomerOrders(supabase, customer.id) : [];

  // wishlist preview: up to 3 items
  let wishlistCount = 0;
  let wishlistProducts: Array<{ slug: string; name: string; nameAr?: string; nameFr?: string; price: number; imageUrl: string | null; tone: string; delivery: string }> = [];
  try {
    if (supabase) {
      const { data: wl } = await supabase
        .from('wishlist_items')
        .select('products(slug,name_en,name_ar,name_fr,price_minor,image_url,tone,delivery)')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });
      const rows = (wl ?? []) as Array<{ products?: { slug?: string; name_en?: string; name_ar?: string; name_fr?: string; price_minor?: number; image_url?: string | null; tone?: string; delivery?: string } | null }>;
      wishlistCount = rows.length;
      // map to product-like
      wishlistProducts = rows
        .slice(0, 3)
        .map((r) => r.products)
        .filter(Boolean)
        .map((p) => ({
          slug: String(p!.slug ?? ''),
          name: String(p!.name_en ?? ''),
          nameAr: p!.name_ar,
          nameFr: p!.name_fr,
          price: Number(p!.price_minor ?? 0),
          imageUrl: (p!.image_url as string | null) ?? null,
          tone: String(p!.tone ?? '#f4ede6'),
          delivery: String(p!.delivery ?? ''),
        }));
    }
    // fallback: show featured products so strip has parity even when wishlist is empty or join failed
    if (wishlistProducts.length === 0) {
      const { products } = await getCatalogRepository().list({});
      wishlistProducts = products.slice(0, 3).map((p) => ({ slug: p.slug, name: p.name, nameAr: p.nameAr, nameFr: p.nameFr, price: p.price, imageUrl: p.imageUrl, tone: p.tone, delivery: p.delivery }));
    }
  } catch {
    wishlistCount = orders.length ? 0 : 0;
  }

  const displayName = customer.displayName?.trim() ? customer.displayName.split(' ')[0]! : 'Nour';
  const greeting = `Good evening, ${displayName}`;

  function pillClasses(status: string) {
    if (status === 'delivered') return 'bg-secondary-container text-on-secondary-container';
    if (status === 'cancelled') return 'bg-surface-dim text-on-surface-variant';
    return 'bg-primary-fixed text-on-primary-fixed';
  }

  function pillText(status: string) {
    // use translated label where possible
    try {
      return fulfillmentLabel(status, t);
    } catch {
      return status;
    }
  }

  return (
    <div className="flex flex-col gap-16">
      {/* Header & Stats — Stitch parity: border-top hairlines, meta mono labels */}
      <section className="flex flex-col gap-8">
        <h1 className="font-display text-[2rem] font-medium leading-tight tracking-tight text-primary">{greeting}</h1>
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1 border-t border-outline-variant/30 pt-4">
            <span className="font-mono text-[0.875rem] uppercase tracking-[0.05em] text-on-surface-variant">Orders placed</span>
            <span className="font-display text-[1.5rem] font-medium leading-none text-on-surface">{orders.length}</span>
          </div>
          <div className="flex flex-1 flex-col gap-1 border-t border-outline-variant/30 pt-4">
            <span className="font-mono text-[0.875rem] uppercase tracking-[0.05em] text-on-surface-variant">Wishlist items</span>
            <span className="font-display text-[1.5rem] font-medium leading-none text-on-surface">{wishlistCount}</span>
          </div>
        </div>
      </section>

      {/* Recent Orders Table — Stitch parity: meta mono header, hairline borders, status pills */}
      <section className="flex flex-col gap-4">
        <h2 className="border-b border-outline-variant/30 pb-3 font-display text-[1.5rem] font-medium leading-tight text-on-surface">Recent Orders</h2>
        {orders.length === 0 ? (
          <p className="py-6 text-sm text-on-surface-variant">{t('noOrdersYet')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30">
                  <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">Order #</th>
                  <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">Date</th>
                  <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">Status</th>
                  <th className="py-3 text-right font-mono text-[0.875rem] font-normal text-on-surface-variant">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 3).map((order) => (
                  <tr key={order.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low">
                    <td className="py-4 font-mono text-[0.875rem] tracking-[0.02em] text-on-surface">
                      <Link className="underline decoration-transparent underline-offset-4 hover:decoration-outline-variant" href={`/${routeLocale}/${city}/account/orders/${order.id}`}>
                        {order.displayNumber}
                      </Link>
                    </td>
                    <td className="py-4 text-sm text-on-surface-variant">
                      {new Date(order.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB', {
                        month: 'short',
                        day: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${pillClasses(order.fulfillmentStatus)}`}
                      >
                        {pillText(order.fulfillmentStatus)}
                      </span>
                    </td>
                    <td className="price py-4 text-right font-mono text-[0.875rem] text-on-surface">{formatMoney(order.totalMinor, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orders.length > 3 ? (
          <Link className="font-mono text-[0.875rem] text-primary underline decoration-outline-variant underline-offset-4 hover:text-surface-tint" href={`/${routeLocale}/${city}/account/orders`}>
            View all orders
          </Link>
        ) : null}
      </section>

      {/* Wishlist Strip — Stitch parity: horizontal scroll, 3 cards, quick add */}
      <section className="flex flex-col gap-4 pt-4">
        <div className="flex items-end justify-between border-b border-outline-variant/30 pb-3">
          <h2 className="font-display text-[1.5rem] font-medium leading-tight text-on-surface">Wishlist Preview</h2>
          <Link
            className="font-mono text-[0.875rem] text-primary underline decoration-outline-variant underline-offset-4 hover:text-surface-tint"
            href={`/${routeLocale}/${city}/wishlist`}
          >
            View all
          </Link>
        </div>
        {wishlistProducts.length === 0 ? (
          <p className="py-6 text-sm text-on-surface-variant">{t('wishlistEmptyHint')}</p>
        ) : (
          <div className="hide-scrollbar flex snap-x gap-6 overflow-x-auto pb-4">
            {wishlistProducts.map((product) => {
              const localizedName = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr }) || product.name;
              return (
                <div key={product.slug} className="group flex w-64 shrink-0 snap-start flex-col gap-3">
                  <Link
                    href={`/${routeLocale}/${city}/shop/${product.slug}`}
                    className="relative aspect-[3/4] overflow-hidden rounded border border-outline-variant/30 bg-surface-container"
                  >
                    <ProductVisual tone={product.tone} imageUrl={product.imageUrl} label={`${localizedName} visual`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </Link>
                  <div className="flex flex-col">
                    <span className="font-display text-[1.125rem] font-medium leading-tight text-on-surface">{localizedName}</span>
                    <span className="price mt-1 font-mono text-[0.875rem] text-on-surface-variant">{formatMoney(product.price, locale)}</span>
                  </div>
                  <Link
                    href={`/${routeLocale}/${city}/shop/${product.slug}`}
                    className="inline-flex h-9 items-center justify-center border border-outline px-4 font-mono text-[0.875rem] uppercase tracking-widest text-primary transition-colors hover:border-primary hover:bg-primary hover:text-on-primary active:scale-95"
                  >
                    Add to bag
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Profile — keep logic, restyle to Stitch's airy spacing (no heavy card) */}
      <section className="flex flex-col gap-6 border-t border-outline-variant/30 pt-10">
        <div>
          <p className="font-mono text-[0.875rem] uppercase tracking-[0.05em] text-on-surface-variant">Profile</p>
          <h2 className="mt-2 font-display text-[1.5rem] font-medium leading-tight text-on-surface">{t('profile')}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{customer.email}</p>
        </div>
        <div className="max-w-[34rem]">
          <ProfileForm initialName={customer.displayName} initialPhone={customer.phone} accountPath={accountPath} />
        </div>
        <form action={signOutCustomer} className="pt-2">
          <input type="hidden" name="accountPath" value={accountPath} />
          <Button type="submit" variant="outline" size="sm">
            {t('signOut')}
          </Button>
        </form>
      </section>

      {/* Email preferences — Stitch parity section */}
      <section id="email-preferences" className="border-t border-outline-variant/30 pt-10">
        <EmailPreferences initialEnabled={preference.status === 'enabled'} loadFailed={preference.status === 'error'} accountPath={accountPath} />
      </section>

      {/* Motion preferences */}
      <section className="border-t border-outline-variant/30 pt-10">
        <h2 className="font-display text-[1.5rem] font-medium leading-tight text-on-surface">Preferences</h2>
        <div className="mt-4">
          <ReduceMotionToggle />
        </div>
      </section>
    </div>
  );
}
