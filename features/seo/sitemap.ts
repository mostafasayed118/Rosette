export type SitemapEntry = {
  url: string;
  changeFrequency: 'daily' | 'weekly';
  priority: number;
  alternates: { languages: Record<string, string> };
};

export function buildSitemapEntries(args: {
  base: string;
  locales: readonly string[];
  cities: readonly string[];
  products: readonly { slug: string }[];
  blogPosts?: readonly { slug: string }[];
  authors?: readonly { slug: string }[];
}): SitemapEntry[] {
  const base = args.base.replace(/\/$/, '');
  const entries: SitemapEntry[] = [];
  function add(locale: string, city: string, path: string, changeFrequency: SitemapEntry['changeFrequency'], priority: number) {
    const languages = Object.fromEntries(args.locales.map((alternateLocale) => [alternateLocale, `${base}/${alternateLocale}/${city}${path}`]));
    entries.push({
      url: `${base}/${locale}/${city}${path}`,
      changeFrequency,
      priority,
      alternates: { languages },
    });
  }
  for (const locale of args.locales) {
    for (const city of args.cities) {
      add(locale, city, '', 'daily', 0.8);
      add(locale, city, '/shop', 'daily', 0.9);
      add(locale, city, '/blog', 'weekly', 0.6);
      add(locale, city, '/delivery', 'daily', 0.7);
      for (const product of args.products) add(locale, city, `/shop/${product.slug}`, 'weekly', 0.7);
      for (const post of args.blogPosts ?? []) add(locale, city, `/blog/${post.slug}`, 'weekly', 0.6);
      for (const author of args.authors ?? []) add(locale, city, `/blog/authors/${author.slug}`, 'weekly', 0.5);
    }
  }
  return entries;
}
