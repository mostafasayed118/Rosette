'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cities, countries } from './data';
import type { Locale } from '@/features/i18n/types';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';

type DestinationGateProps = { locale: Locale };

export function DestinationGate({ locale }: DestinationGateProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [countryCode, setCountryCode] = useState('EG');
  const [cityCode, setCityCode] = useState('');
  const [requested, setRequested] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cityCode) return;
    const city = cities.find((c) => c.code === cityCode);
    router.push(`/${locale}/${city?.slug ?? cityCode}`);
  }

  return (
    <section className="max-w-[31rem] rounded-2xl border bg-card/70 p-8 shadow-sm" aria-labelledby="destination-title">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('destinationEyebrow')}</p>
      <h1 id="destination-title" className="mt-2 mb-6 max-w-[10ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.06em] text-primary">{t('destinationTitle')}</h1>
      <p className="max-w-[42rem] text-[1.1rem] text-muted-foreground">{t('destinationLede')}</p>
      {requested ? <div className="mb-4 rounded-xl bg-accent p-3 text-sm text-primary" role="status">{t('requestSaved')}</div> : null}
      <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-1.5">
          <span className="text-sm font-bold text-foreground">{t('country')}</span>
          <Select value={countryCode} onValueChange={(value) => { setCountryCode(value); setCityCode(''); }}>
            <SelectTrigger className="w-full" aria-label={t('country')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map((country) => <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-bold text-foreground">{t('deliveryCity')}</span>
          <Select value={cityCode} onValueChange={setCityCode}>
            <SelectTrigger className="w-full" aria-label={t('deliveryCity')}><SelectValue placeholder={t('selectCity')} /></SelectTrigger>
            <SelectContent>
              {cities.filter((city) => city.countryCode === countryCode).map((city) => <SelectItem key={city.code} value={city.code}>{pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr })}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">{t('continue')} <span aria-hidden="true">↗</span></Button>
      </form>
      <button className="mt-4 text-sm text-muted-foreground underline underline-offset-4" type="button" onClick={() => setRequested(true)}>{t('unsupported')}</button>
    </section>
  );
}
