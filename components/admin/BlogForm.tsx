'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { BlogPostInput } from '@/features/blog/types';

export function BlogForm({ post, id, authors = [] }: { post: BlogPostInput; id?: string; authors?: { id: string; nameEn: string }[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [slug, setSlug] = useState(post.slug);
  const [type, setType] = useState<BlogPostInput['type']>(post.type);
  const [cityCode, setCityCode] = useState(post.cityCode ?? '');
  const [authorId, setAuthorId] = useState(post.authorId ?? '');
  const [titleEn, setTitleEn] = useState(post.titleEn);
  const [titleAr, setTitleAr] = useState(post.titleAr ?? '');
  const [titleFr, setTitleFr] = useState(post.titleFr ?? '');
  const [excerptEn, setExcerptEn] = useState(post.excerptEn ?? '');
  const [excerptAr, setExcerptAr] = useState(post.excerptAr ?? '');
  const [excerptFr, setExcerptFr] = useState(post.excerptFr ?? '');
  const [contentEn, setContentEn] = useState(post.contentEn);
  const [contentAr, setContentAr] = useState(post.contentAr ?? '');
  const [contentFr, setContentFr] = useState(post.contentFr ?? '');
  const [category, setCategory] = useState(post.category ?? '');
  const [published, setPublished] = useState(post.published);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body: BlogPostInput = {
      slug, type,
      cityCode: type === 'city' ? cityCode || null : null,
      authorId: authorId || null,
      titleEn, titleAr: titleAr || undefined, titleFr: titleFr || undefined,
      excerptEn: excerptEn || undefined, excerptAr: excerptAr || undefined, excerptFr: excerptFr || undefined,
      contentEn, contentAr: contentAr || undefined, contentFr: contentFr || undefined,
      category: category || undefined,
      published,
    };
    const response = await fetch('/api/admin/blog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { action: 'update-post', id, post: body } : { action: 'create-post', post: body }) });
    if (!response.ok) { setError(t('couldNotSaveBlogPost')); setSaving(false); return; }
    router.push('/admin/blog');
    router.refresh();
  }

  return <form className="grid max-w-2xl gap-4" onSubmit={submit}>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('slugLabel')}</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} required /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('blogPostType')}</label><Select value={type} onValueChange={(v) => setType(v as BlogPostInput['type'])}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="post">{t('blogTypePost')}</SelectItem><SelectItem value="city">{t('blogTypeCity')}</SelectItem></SelectContent></Select></div>
    {type === 'city' ? <div className="grid gap-2"><label className="text-sm font-medium">{t('cityCodeLabel')}</label><Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} placeholder="greater-cairo" /></div> : null}
    <div className="grid gap-2"><label className="text-sm font-medium">{t('authorLabel')}</label><Select value={authorId || 'none'} onValueChange={(value) => setAuthorId(value === 'none' ? '' : value)}><SelectTrigger className="w-64"><SelectValue placeholder={t('authorNone')} /></SelectTrigger><SelectContent><SelectItem value="none">{t('authorNone')}</SelectItem>{authors.map((author) => <SelectItem key={author.id} value={author.id}>{author.nameEn}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('titleEn')}</label><Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('titleAr')}</label><Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('titleFr')}</label><Input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('excerptEn')}</label><Textarea value={excerptEn} onChange={(e) => setExcerptEn(e.target.value)} rows={2} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('excerptAr')}</label><Textarea value={excerptAr} onChange={(e) => setExcerptAr(e.target.value)} rows={2} dir="rtl" /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('excerptFr')}</label><Textarea value={excerptFr} onChange={(e) => setExcerptFr(e.target.value)} rows={2} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('contentEn')}</label><Textarea value={contentEn} onChange={(e) => setContentEn(e.target.value)} rows={8} required /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('contentAr')}</label><Textarea value={contentAr} onChange={(e) => setContentAr(e.target.value)} rows={8} dir="rtl" /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('contentFr')}</label><Textarea value={contentFr} onChange={(e) => setContentFr(e.target.value)} rows={8} /></div>
    <div className="grid gap-2"><label className="text-sm font-medium">{t('blogCategory')}</label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="guides / care / occasions / delivery" /></div>
    <label className="flex items-center gap-2"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="accent-primary" /><span className="text-sm">{t('publishedLabel')}</span></label>
    <div className="flex items-center gap-3"><Button type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</div>
  </form>;
}
