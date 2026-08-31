import { buildBlogPostingJsonLd } from '@/features/seo/blog-jsonld';
import { serializeJsonLd } from '@/lib/sanitize-html';

export function BlogPostingJsonLd(args: { post: { slug: string; title: string; excerpt?: string; publishedAt: string | null; updatedAt: string }; url: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildBlogPostingJsonLd(args)) }} />;
}
