'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function AccountNavItem() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // Dynamic import keeps `@supabase/ssr` out of the initial bundle; the
      // chunk is only fetched when this nav item actually mounts.
      const { getBrowserSupabase } = await import('@/lib/supabase/browser');
      const supabase = getBrowserSupabase();
      if (!supabase || !active) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (active) setSignedIn(Boolean(user));
    })();
    return () => { active = false; };
  }, []);

  return <Link href={signedIn ? href('/account') : href('/account/login')}>{signedIn ? t('navAccount') : t('signIn')}</Link>;
}
