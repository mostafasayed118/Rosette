export function buildPersonJsonLd(args: { name: string; url: string; jobTitle?: string; description?: string; image?: string }) {
  const ld: Record<string, string> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: args.name,
    url: args.url,
  };
  if (args.jobTitle) ld.jobTitle = args.jobTitle;
  if (args.description) ld.description = args.description;
  if (args.image) ld.image = args.image;
  return ld;
}
