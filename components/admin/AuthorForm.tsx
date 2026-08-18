'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { AuthorInput } from '@/features/blog/types';

export function AuthorForm({ author, id }: { author: AuthorInput; id?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [slug, setSlug] = useState(author.slug);
  const [nameEn, setNameEn] = useState(author.nameEn);
  const [nameAr, setNameAr] = useState(author.nameAr ?? '');
  const [nameFr, setNameFr] = useState(author.nameFr ?? '');
  const [roleEn, setRoleEn] = useState(author.roleEn ?? '');
  const [roleAr, setRoleAr] = useState(author.roleAr ?? '');
  const [roleFr, setRoleFr] = useState(author.roleFr ?? '');
  const [bioEn, setBioEn] = useState(author.bioEn ?? '');
  const [bioAr, setBioAr] = useState(author.bioAr ?? '');
  const [bioFr, setBioFr] = useState(author.bioFr ?? '');
  const [avatarUrl, setAvatarUrl] = useState(author.avatarUrl ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body: AuthorInput = {
      slug, nameEn, nameAr: nameAr || undefined, nameFr: nameFr || undefined,
      roleEn: roleEn || undefined, roleAr: roleAr || undefined, roleFr: roleFr || undefined,
      bioEn: bioEn || undefined, bioAr: bioAr || undefined, bioFr: bioFr || undefined,
      avatarUrl: avatarUrl || undefined,
    };
    const response = await fetch('/api/admin/authors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { action: 'update-author', id, author: body } : { action: 'create-author', author: body }) });
    if (!response.ok) { setError(t('couldNotSaveAuthor')); setSaving(false); return; }
    router.push('/admin/authors');
    router.refresh();
  }

  return <form className="grid max-w-2xl gap-4" onSubmit={submit}>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('slugLabel')}</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} required /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('nameEn')}</label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} required /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('nameAr')}</label><Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('nameFr')}</label><Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('roleEn')}</label><Input value={roleEn} onChange={(e) => setRoleEn(e.target.value)} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('roleAr')}</label><Input value={roleAr} onChange={(e) => setRoleAr(e.target.value)} dir="rtl" /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('roleFr')}</label><Input value={roleFr} onChange={(e) => setRoleFr(e.target.value)} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('bioEn')}</label><Textarea value={bioEn} onChange={(e) => setBioEn(e.target.value)} rows={3} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('bioAr')}</label><Textarea value={bioAr} onChange={(e) => setBioAr(e.target.value)} rows={3} dir="rtl" /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('bioFr')}</label><Textarea value={bioFr} onChange={(e) => setBioFr(e.target.value)} rows={3} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('avatarUrl')}</label><Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" /></div>
    <div className="flex items-center gap-3"><Button type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</div>
  </form>;
}
