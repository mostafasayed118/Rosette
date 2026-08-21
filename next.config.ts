import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Cloudflare Workers cannot run Next's default (sharp-based) optimizer.
    // OpenNext serves these through the Workers image resizing pipeline instead.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
