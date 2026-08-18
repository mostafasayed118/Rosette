import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AddCityForm } from '@/components/admin/AddCityForm';
import { DeliveryRuleForm, type DeliveryRuleInitial } from '@/components/admin/DeliveryRuleForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

const DEFAULT_FEE_MINOR = 1500;

type CityRow = { code: string; name_en: string; name_ar: string; same_day: boolean; delivery_rules?: Array<{ fee_minor: number; minimum_order_minor: number; cutoff_hour: number; active: boolean }> };

export default async function AdminDeliveryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { data } = await getAdminSupabase().from('cities').select('code,name_en,name_ar,same_day,delivery_rules(*)').order('code');
  const rows = (data ?? []) as CityRow[];
  return <AdminShell>
    <p className="eyebrow">{t('deliveryOperations')}</p>
    <h1>{t('deliveryRules')}</h1>
    <AddCityForm />
    <div className="admin-table">
      {rows.map((city) => {
        const rule = city.delivery_rules?.[0];
        const initial: DeliveryRuleInitial = { feeMinor: rule?.fee_minor ?? DEFAULT_FEE_MINOR, minimumOrderMinor: rule?.minimum_order_minor ?? 0, cutoffHour: rule?.cutoff_hour ?? 14, active: rule?.active ?? false };
        return <article className="status-message" key={city.code}>
          <strong>{city.name_en}</strong>
          <span>{city.name_ar} · {city.code} · {city.same_day ? t('sameDay') : t('nextDay')} · {rule?.active ? t('active') : t('inactive')}</span>
          <DeliveryRuleForm cityCode={city.code} initial={initial} />
        </article>;
      })}
    </div>
  </AdminShell>;
}
