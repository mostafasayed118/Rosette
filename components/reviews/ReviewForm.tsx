'use client';

import { useEffect, useRef, useState } from 'react';
import { deferToTask } from '@/hooks/use-deferred-task';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, X } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { REVIEW_PHOTO_MAX, REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_TYPES } from '@/features/reviews/review-storage';

export type ReviewFormState = 'anonymous' | 'not-verified' | 'already-reviewed' | 'can-review';

const ACCEPT = (REVIEW_PHOTO_TYPES as readonly string[]).join(',');

function makePreview(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

export function ReviewForm({ productSlug, state }: { productSlug: string; state: ReviewFormState }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Array<string | null>>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Build previews once per photo set and revoke the object URLs afterwards
  // so repeated renders (typing, re-renders) never leak blob URLs.
  useEffect(() => {
    const created = photos.map(makePreview);
    // Deferred so the preview setState lands outside the commit phase; the
    // revoke cleanup still owns the same `created` array.
    deferToTask(() => setPreviews(created));
    return () => {
      for (const url of created) if (url) URL.revokeObjectURL(url);
    };
  }, [photos]);

  if (state === 'anonymous') {
    return <p className="text-sm text-muted-foreground">{t('reviewSignInPrompt')}</p>;
  }
  if (state === 'not-verified') {
    return <p className="text-sm text-muted-foreground">{t('verifiedPurchaseOnly')}</p>;
  }
  if (state === 'already-reviewed') {
    return <p className="text-sm text-muted-foreground">{t('alreadyReviewed')}</p>;
  }
  if (pending) {
    return <p className="text-sm text-primary" role="status">{t('reviewPending')}</p>;
  }

  function onFiles(files: FileList | null) {
    const next = files ? Array.from(files).slice(0, REVIEW_PHOTO_MAX) : [];
    if (files && files.length > REVIEW_PHOTO_MAX) { setPhotoError(t('photoTooMany')); return; }
    if (next.some((file) => file.size > REVIEW_PHOTO_MAX_BYTES)) { setPhotoError(t('photoTooLarge')); return; }
    if (next.some((file) => !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type))) { setPhotoError(t('photoInvalidType')); return; }
    setPhotoError(null);
    setPhotos(next);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  async function submit() {
    if (rating < 1 || !body.trim() || busy) return;
    setBusy(true);
    setError(false);
    setPhotoError(null);
    let photoUrls: string[] = [];
    if (photos.length > 0) {
      const formData = new FormData();
      photos.forEach((file) => formData.append('photos', file));
      const uploadResponse = await fetch('/api/account/review-photos', { method: 'POST', body: formData });
      if (!uploadResponse.ok) { setBusy(false); setPhotoError(t('photoUploadFailed')); return; }
      const uploadData = await uploadResponse.json();
      photoUrls = Array.isArray(uploadData.urls) ? uploadData.urls : [];
    }
    const response = await fetch(`/api/account/products/${productSlug}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, body: body.trim(), photos: photoUrls }) });
    setBusy(false);
    if (!response.ok) { setError(true); return; }
    setPending(true);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1" role="group" aria-label={t('rating')}>
        {[1, 2, 3, 4, 5].map((index) => (
          <button key={index} type="button" aria-label={`${index}/5`} onClick={() => setRating(index)} className="p-0.5">
            <Star size={20} className={index <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={400} placeholder={t('reviewPlaceholder')} />
      <input ref={fileInput} type="file" accept={ACCEPT} multiple className="hidden" aria-label={t('addPhotos')} onChange={(event) => onFiles(event.target.files)} />
      <button type="button" onClick={() => fileInput.current?.click()} className="text-sm text-primary underline underline-offset-4">{t('addPhotos')}</button>
      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((file, index) => {
            const preview = previews[index] ?? null;
            return (
              <div key={`${file.name}-${index}`} className="relative">
                {/* Local blob: URL previews are not routable by the image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview ? <img src={preview} alt={file.name} className="h-16 w-16 rounded object-cover" /> : null}
                <button type="button" onClick={() => removePhoto(index)} aria-label={t('removePhoto')} className="absolute -right-1 -top-1 rounded-full bg-muted p-0.5"><X size={12} aria-hidden="true" /></button>
              </div>
            );
          })}
        </div>
      ) : null}
      {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={busy || rating < 1 || !body.trim()}>{t('submitReview')}</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{t('reviewSubmitFailed')}</p> : null}
    </div>
  );
}
