import { buildPersonJsonLd } from '@/features/seo/person-jsonld';
import { serializeJsonLd } from '@/lib/sanitize-html';

export function PersonJsonLd(args: { name: string; url: string; jobTitle?: string; description?: string; image?: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildPersonJsonLd(args)) }} />;
}
