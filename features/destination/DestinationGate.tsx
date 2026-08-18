'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cities, countries } from './data';
import { writeDestination } from './storage';
import type { Destination } from './types';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';

type DestinationGateProps = { onSelected?: (destination: Destination) => void };

const selectClass = 'h-11 w-full rounded-[10px] border border-border bg-background px-3.5 text-foreground';

export function DestinationGate({ onSelected }: DestinationGateProps) {
  const { locale, t } = useI18n();
  const [countryCode, setCountryCode] = useState('EG');
  const [cityCode, setCityCode] = useState('');
  const [requested, setRequested] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cityCode) return;
    const destination = { countryCode, cityCode };
    writeDestination(destination);
    onSelected?.(destination);
  }

  return (
    <section className="max-w-[31rem] rounded-2xl border bg-card/70 p-8 shadow-sm" aria-labelledby="destination-title">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('destinationEyebrow')}</p>
      <h1 id="destination-title" className="mt-2 mb-6 max-w-[10ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.06em] text-primary">{t('destinationTitle')}</h1>
      <p className="max-w-[42rem] text-[1.1rem] text-muted-foreground">{t('destinationLede')}</p>
      {requested ? <div className="mb-4 rounded-xl bg-accent p-3 text-sm text-primary" role="status">{t('requestSaved')}</div> : null}
      <form className="mt-4 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1.5" htmlFor="country"><span className="text-sm font-bold text-foreground">{t('country')}</span><select id="country" className={selectClass} value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label className="grid gap-1.5" htmlFor="city"><span className="text-sm font-bold text-foreground">{t('deliveryCity')}</span><select id="city" className={selectClass} value={cityCode} onChange={(event) => setCityCode(event.target.value)} required><option value="">{t('selectCity')}</option>{cities.filter((city) => city.countryCode === countryCode).map((city) => <option key={city.code} value={city.code}>{pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr })}</option>)}</select></label>
        <Button type="submit">{t('continue')} <span aria-hidden="true">↗</span></Button>
      </form>
      <button className="mt-4 text-sm text-muted-foreground underline underline-offset-4" type="button" onClick={() => setRequested(true)}>{t('unsupported')}</button>
    </section>
  );
}
