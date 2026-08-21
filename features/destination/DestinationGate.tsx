'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cities, countries } from './data';
import type { Locale } from '@/features/i18n/types';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';

type DestinationGateProps = { locale: Locale };

const GATE_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBvPr3cHMVc8OxmgOH3zDhRDQP1C74BiCSSYCUnTZqhyQeRMUJ18i6TVkIC5soy8c8IPmtuscRdS1rukTQjU-539UXM6lr3OOyEsS4W1swNJPr7FHMii7drnW8f4Ybt04n5788s3QXn6hUYruEeoSHIO8N31ATBAuLyCo7crEjeWCpPBqDKG73W8X0o-Jla7aPqROAzbr4iKbMQjAHQzhNK9PaEypQ1nehtharAosSa0SgK_6qXdDahJQ';

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
    <section
      className="w-full bg-surface text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed overflow-x-hidden"
      aria-labelledby="destination-title"
    >
      <div className="w-full max-w-[1280px] mx-auto px-5 md:px-16 py-12 md:py-[102px]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Left Content Block: offset by 1 column, spans 5 for editorial whitespace */}
          <div className="md:col-span-5 md:col-start-2 flex flex-col gap-8 z-10 py-6 md:py-12 order-2 md:order-1">
            <div className="flex flex-col gap-2">
              <span className="font-meta-mono text-meta-mono text-tertiary tracking-[0.05em]">
                {t('destinationEyebrow')}
              </span>
              <h1
                id="destination-title"
                className="font-display-xl-mobile text-display-xl-mobile md:font-display-xl md:text-display-xl font-semibold leading-[1.1] tracking-[-0.02em] text-on-surface text-balance"
              >
                {t('destinationTitle')}
              </h1>
            </div>

            {requested ? (
              <div
                className="rounded-xl bg-secondary-container text-on-secondary-container px-4 py-3 text-sm leading-relaxed"
                role="status"
              >
                {t('requestSaved')}
              </div>
            ) : null}

            <form className="flex flex-col gap-4 mt-2 w-full md:w-[90%]" onSubmit={handleSubmit}>
              {/* Country Dropdown — pill */}
              <div className="relative w-full group">
                <Select
                  value={countryCode}
                  onValueChange={(value) => {
                    setCountryCode(value);
                    setCityCode('');
                  }}
                >
                  <SelectTrigger
                    className="w-full bg-surface-container-low border border-outline-variant rounded-full py-4 pl-6 pr-12 text-body-lg font-body-lg text-on-surface hover:border-outline focus-visible:border-[#476647] focus-visible:ring-2 focus-visible:ring-[#476647] focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-all duration-300 shadow-none data-[placeholder]:text-on-surface-variant h-auto min-h-[56px] [&_svg]:opacity-100 [&_svg]:text-tertiary group-hover:[&_svg]:text-primary"
                    aria-label={t('country')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* City Dropdown — pill */}
              <div className="relative w-full group">
                <Select value={cityCode} onValueChange={setCityCode}>
                  <SelectTrigger
                    className="w-full bg-surface-container-low border border-outline-variant rounded-full py-4 pl-6 pr-12 text-body-lg font-body-lg text-on-surface hover:border-outline focus-visible:border-[#476647] focus-visible:ring-2 focus-visible:ring-[#476647] focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-all duration-300 shadow-none data-[placeholder]:text-on-surface-variant h-auto min-h-[56px] [&_svg]:opacity-100 [&_svg]:text-tertiary group-hover:[&_svg]:text-primary"
                    aria-label={t('deliveryCity')}
                  >
                    <SelectValue placeholder={t('selectCity')} />
                  </SelectTrigger>
                  <SelectContent>
                    {cities
                      .filter((city) => city.countryCode === countryCode)
                      .map((city) => (
                        <SelectItem key={city.code} value={city.code}>
                          {pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr })}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Primary CTA — pill */}
              <Button
                type="submit"
                className="w-full bg-primary text-on-primary rounded-full py-4 px-8 mt-2 h-auto min-h-[56px] font-body-lg text-body-lg text-center hover:bg-surface-tint shadow-sm hover:shadow-md flex items-center justify-center gap-2 transition-[transform,box-shadow,background-color] duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {t('continue')}
                <ArrowRight className="h-[1.2em] w-[1.2em] shrink-0" aria-hidden="true" />
              </Button>
            </form>

            {/* Meta Link */}
            <div className="mt-1">
              <button
                className="font-body-md text-body-md text-tertiary underline decoration-outline-variant underline-offset-4 hover:text-primary transition-colors duration-300 text-left"
                type="button"
                onClick={() => setRequested(true)}
              >
                {t('unsupported')}
              </button>
            </div>
          </div>

          {/* Right Image Block: spans 6 columns, subtle paper-on-paper frame */}
          <div className="md:col-span-5 md:col-start-8 h-[614px] md:h-[768px] w-full relative rounded-lg overflow-hidden order-1 md:order-2 bg-surface-container-low">
            <img
              alt="A high-end, soft botanical photograph of a vintage courier bicycle basket overflowing with fresh, artisanal florist blooms like ranunculus and lilies. The scene is bathed in warm, airy, editorial natural light."
              className="absolute inset-0 w-full h-full object-cover rounded-lg mix-blend-multiply opacity-90 transition-transform duration-1000 hover:scale-105"
              src={GATE_IMAGE}
            />
            {/* Subtle ambient glow to blend with canvas */}
            <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(255,248,243,0.5)] pointer-events-none rounded-lg" />
            {/* Hairline border frame */}
            <div className="absolute inset-0 border border-outline-variant/30 rounded-lg pointer-events-none" />
          </div>
        </div>
      </div>
    </section>
  );
}
