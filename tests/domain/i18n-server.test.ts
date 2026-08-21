import { describe, expect, it } from 'vitest';
import { getServerT } from '@/features/i18n/server';

describe('getServerT', () => {
  it('uses an explicit locale without reading cookies', async () => {
    const ar = await getServerT('ar');
    expect(ar.locale).toBe('ar');
    expect(ar.t('homeTitle')).toBe('زهور تقول ما تعجز عنه الكلمات.');

    const fr = await getServerT('fr');
    expect(fr.locale).toBe('fr');
    expect(fr.t('signOut')).toBe('Se déconnecter');
  });

  it('normalizes an unknown locale to English', async () => {
    const { locale, t } = await getServerT('xx');
    expect(locale).toBe('en');
    expect(t('homeTitle')).toBe('Flowers that say it before you do.');
  });

  it('falls back to the English dictionary for a missing key', async () => {
    const { t } = await getServerT('ar');
    expect(t('__missing_key__')).toBe('__missing_key__');
  });
});
