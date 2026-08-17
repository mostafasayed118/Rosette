'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { cities, countries } from './data';
import { writeDestination } from './storage';
import type { Destination } from './types';
import { useI18n } from '@/features/i18n/I18nProvider';

type DestinationGateProps = { onSelected?: (destination: Destination) => void };

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
    <section className="destination-card" aria-labelledby="destination-title">
      <p className="eyebrow">{t('destinationEyebrow')}</p>
      <h1 id="destination-title">{t('destinationTitle')}</h1>
      <p className="lede">{t('destinationLede')}</p>
      {requested ? <div className="request-note" role="status">{t('requestSaved')}</div> : null}
      <form className="destination-form" onSubmit={handleSubmit}>
        <label className="field" htmlFor="country"><span>{t('country')}</span><select id="country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label className="field" htmlFor="city"><span>{t('deliveryCity')}</span><select id="city" value={cityCode} onChange={(event) => setCityCode(event.target.value)} required><option value="">{t('selectCity')}</option>{cities.filter((city) => city.countryCode === countryCode).map((city) => <option key={city.code} value={city.code}>{locale === 'ar' ? city.nameAr : city.name}</option>)}</select></label>
        <Button type="submit">{t('continue')} <span aria-hidden="true">↗</span></Button>
      </form>
      <button className="text-button" type="button" onClick={() => setRequested(true)}>{t('unsupported')}</button>
    </section>
  );
}
