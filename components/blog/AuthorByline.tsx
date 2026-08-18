import Link from 'next/link';
import { pickLocalized } from '@/features/i18n/pick';
import type { Locale } from '@/features/i18n/types';
import type { Author } from '@/features/blog/types';

export function AuthorByline({ author, locale, city }: { author: Author | null; locale: Locale; city: string }) {
  if (!author) return null;
  const name = pickLocalized(locale, { en: author.nameEn, ar: author.nameAr ?? author.nameEn, fr: author.nameFr ?? author.nameEn });
  const role = pickLocalized(locale, { en: author.roleEn ?? '', ar: author.roleAr ?? '', fr: author.roleFr ?? '' });
  const bio = pickLocalized(locale, { en: author.bioEn ?? '', ar: author.bioAr ?? '', fr: author.bioFr ?? '' });
  return <Link className="mt-8 flex items-start gap-4 border-t border-border pt-6" href={`/${locale}/${city}/blog/authors/${author.slug}`}>
    {author.avatarUrl ? <img src={author.avatarUrl} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 rounded-full object-cover" /> : <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-accent font-display text-lg text-primary">{name.slice(0, 1)}</span>}
    <div>
      <p className="font-medium text-foreground">{name}</p>
      {role ? <p className="text-sm text-muted-foreground">{role}</p> : null}
      {bio ? <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{bio}</p> : null}
    </div>
  </Link>;
}
