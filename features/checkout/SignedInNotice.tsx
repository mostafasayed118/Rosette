'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';

export function SignedInNotice() {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (active) setEmail(user?.email ?? null);
    })();
    return () => { active = false; };
  }, []);

  if (!email) return null;
  return <p className="text-sm text-muted-foreground">{t('orderingAs', { email })}</p>;
}
