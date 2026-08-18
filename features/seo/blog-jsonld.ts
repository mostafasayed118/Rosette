export function buildBlogPostingJsonLd(args: {
  post: { slug: string; title: string; excerpt?: string; publishedAt: string | null; updatedAt: string };
  url: string;
}) {
  const { post, url } = args;
  const datePublished = post.publishedAt ?? post.updatedAt;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    url,
    datePublished,
    dateModified: post.updatedAt,
  };
}
