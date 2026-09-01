import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { messages } from '@/features/i18n/dictionaries';
import { translate } from '@/features/i18n/translate';
import AdminShellSource from '@/components/admin/AdminShell.tsx?raw';
import AdminLanguageToggleSource from '@/components/admin/AdminLanguageToggle.tsx?raw';

describe('admin localization — dictionary completeness', () => {
  it('en has titleEn/titleAr/titleFr, newPlan and freeShipping', () => {
    for (const k of ['titleEn', 'titleAr', 'titleFr', 'freeShipping', 'newPlan']) {
      expect(messages.en[k], `en.${k}`).toBeTruthy();
      expect(messages.ar[k], `ar.${k}`).toBeTruthy();
      expect(messages.fr[k], `fr.${k}`).toBeTruthy();
    }
  });

  it('fr active/inactive are translated (not English fallback)', () => {
    expect(messages.fr.active).toBe('Actif');
    expect(messages.fr.inactive).toBe('Inactif');
    expect(messages.fr.activeVisible).toMatch(/Actif/);
    expect(messages.fr.giftCardStatus_active).toBe('Actif');
  });

  it('all admin-used keys exist in en/ar (admin is EN/AR only) and ar not empty', () => {
    // Admin is EN/AR only per product requirement — FR not needed for admin.
    // Storefront still has FR, but admin keys are verified for en/ar only.
    const adminKeys = [
      'adminEyebrow', 'adminDashboard', 'signedInAs', 'signOut', 'languagePicker',
      'orders', 'products', 'inventory', 'deliveryRules', 'promos', 'giftCards', 'subscriptionsTitle',
      'blogTitle', 'authors', 'notifications', 'auditLog',
      'awaitingFulfillment', 'revenueToday', 'revenueAllTime', 'subscriptionsTitle', 'subscriptionNextDelivery',
      'fulfillmentPipeline', 'lowStockTitle', 'nothingLow', 'openInventory',
      'noOrdersMatch', 'orders', 'recipient', 'payment', 'fulfillment', 'total',
      'panelCouldNotLoad', 'requestFailed', 'tryAgain', 'errorRefLabel', 'loading',
      'titleEn', 'titleAr', 'titleFr', 'freeShipping', 'newPlan', 'active', 'inactive', 'edit',
      'noImage', 'save', 'saving', 'languageEn', 'languageAr',
    ];
    for (const k of adminKeys) {
      expect(messages.en[k], `en.${k}`).toBeTruthy();
      expect(messages.ar[k], `ar.${k}`).toBeTruthy();
      expect(messages.ar[k]!.trim().length, `ar.${k} empty`).toBeGreaterThan(0);
    }
  });

  it('admin toggle is EN/AR only and fr falls back to en', () => {
    expect(AdminLanguageToggleSource).not.toMatch(/'fr'/);
    expect(AdminLanguageToggleSource).toMatch(/'en'/);
    expect(AdminLanguageToggleSource).toMatch(/'ar'/);
    // Server helper normalizes fr -> en
    const adminServerSrc = readFileSync(join(process.cwd(), 'features/i18n/admin-server.ts'), 'utf-8');
    expect(adminServerSrc).toMatch(/raw === 'ar' \? 'ar' : 'en'/);
  });
});

describe('admin localization — fallback', () => {
  it('translate falls back to English when key missing in ar/fr', () => {
    // Simulate missing key in ar by deleting at runtime, translate should fallback to en then key
    const missing = '__admin_missing_test_key__';
    expect(translate('ar', missing)).toBe(missing);
    expect(translate('fr', missing)).toBe(missing);
    // If en has it but ar does not, fallback to en: temporarily patch
    (messages.en as Record<string, string>)[missing] = 'EN fallback';
    expect(translate('ar', missing)).toBe('EN fallback');
    delete (messages.en as Record<string, string>)[missing];
  });

  it('translate returns key itself when missing in all locales', () => {
    expect(translate('en', '__no_such_key__')).toBe('__no_such_key__');
    expect(translate('ar', '__no_such_key__')).toBe('__no_such_key__');
  });
});

describe('admin localization — language selection and persistence', () => {
  it('AdminShell renders AdminLanguageToggle and persists via setLocale', () => {
    expect(AdminShellSource).toMatch(/AdminLanguageToggle/);
    expect(AdminLanguageToggleSource).toMatch(/setLocale/);
    expect(AdminLanguageToggleSource).toMatch(/router\.refresh/);
    expect(AdminLanguageToggleSource).toMatch(/localStorage|rosette\.locale/);
    // Uses translate fallback path for missing context in error boundary
    expect(AdminLanguageToggleSource).toMatch(/languagePicker/);
  });

  it('AdminShell header contains signOut and language toggle together', () => {
    expect(AdminShellSource).toMatch(/signOut/);
    expect(AdminShellSource).toMatch(/AdminLanguageToggle/);
  });

  it('admin pages use getAdminServerT (EN/AR cookie-resolved locale) not hardcoded language', () => {
    const adminPages = [
      'app/admin/page.tsx',
      'app/admin/orders/page.tsx',
      'app/admin/products/page.tsx',
      'app/admin/promos/page.tsx',
      'app/admin/subscriptions/plans/page.tsx',
      'app/admin/blog/page.tsx',
      'app/admin/reviews/page.tsx',
      'app/admin/notifications/page.tsx',
      'app/admin/delivery/page.tsx',
      'app/admin/inventory/page.tsx',
      'app/admin/audit-log/page.tsx',
      'app/admin/cancel-requests/page.tsx',
      'app/admin/change-requests/page.tsx',
    ];
    for (const rel of adminPages) {
      const src = readFileSync(join(process.cwd(), rel), 'utf-8');
      expect(src, `${rel} must call getAdminServerT`).toMatch(/getAdminServerT/);
    }
  });

  it('no admin page has hardcoded "New plan"/"Free shipping"/"This panel could not load" after hardening', () => {
    const hardcodedPatterns = [/\"New plan\"/, /Free shipping/, /This panel could not load\.?/, /\"Loading\"/];
    const files = [
      'app/admin/subscriptions/plans/page.tsx',
      'app/admin/subscriptions/plans/new/page.tsx',
      'app/admin/error.tsx',
      'components/admin/PromoForm.tsx',
    ];
    for (const rel of files) {
      if (!existsSync(join(process.cwd(), rel))) continue;
      const src = readFileSync(join(process.cwd(), rel), 'utf-8');
      for (const pat of hardcodedPatterns) {
        // Error and loading now use t(), so raw English should not appear outside t()
        if (rel.includes('error.tsx') || rel.includes('loading.tsx')) {
          expect(src).not.toMatch(pat);
        }
      }
    }
    // Explicit checks for the fixed files
    const plansSrc = readFileSync(join(process.cwd(), 'app/admin/subscriptions/plans/page.tsx'), 'utf-8');
    expect(plansSrc).toMatch(/t\('newPlan'\)/);
    expect(plansSrc).toMatch(/t\('active'\)/);
    expect(plansSrc).not.toMatch(/\"New plan\"/);
    const promoSrc = readFileSync(join(process.cwd(), 'components/admin/PromoForm.tsx'), 'utf-8');
    expect(promoSrc).toMatch(/t\('freeShipping'\)/);
    expect(promoSrc).not.toMatch(/>Free shipping</);
    const errorSrc = readFileSync(join(process.cwd(), 'app/admin/error.tsx'), 'utf-8');
    expect(errorSrc).toMatch(/t\('panelCouldNotLoad'\)/);
    expect(errorSrc).toMatch(/t\('requestFailed'\)/);
  });
});

describe('admin localization — preserve functionality', () => {
  it('admin still shows brand Rosette and orders/products/inventory navigation', () => {
    expect(AdminShellSource).toMatch(/Rosette/);
    expect(AdminShellSource).toMatch(/adminDashboard/);
    expect(AdminShellSource).toMatch(/orders/);
    expect(AdminShellSource).toMatch(/products/);
  });
});
