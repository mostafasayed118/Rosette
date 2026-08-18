export type SitemapEntry = { url: string; changeFrequency: 'daily' | 'weekly'; priority: number };

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
  for (const locale of args.locales) {
    for (const city of args.cities) {
      entries.push({ url: `${base}/${locale}/${city}`, changeFrequency: 'daily', priority: 0.8 });
      entries.push({ url: `${base}/${locale}/${city}/shop`, changeFrequency: 'daily', priority: 0.9 });
      entries.push({ url: `${base}/${locale}/${city}/blog`, changeFrequency: 'weekly', priority: 0.6 });
      entries.push({ url: `${base}/${locale}/${city}/delivery`, changeFrequency: 'daily', priority: 0.7 });
      for (const product of args.products) {
        entries.push({ url: `${base}/${locale}/${city}/shop/${product.slug}`, changeFrequency: 'weekly', priority: 0.7 });
      }
      for (const post of args.blogPosts ?? []) {
        entries.push({ url: `${base}/${locale}/${city}/blog/${post.slug}`, changeFrequency: 'weekly', priority: 0.6 });
      }
      for (const author of args.authors ?? []) {
        entries.push({ url: `${base}/${locale}/${city}/blog/authors/${author.slug}`, changeFrequency: 'weekly', priority: 0.5 });
      }
    }
  }
  return entries;
}
