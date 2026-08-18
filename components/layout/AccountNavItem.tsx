'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function AccountNavItem() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (active) setSignedIn(Boolean(user));
    })();
    return () => { active = false; };
  }, []);

  return <Link href={signedIn ? href('/account') : href('/account/login')}>{signedIn ? t('account') : t('signIn')}</Link>;
}
