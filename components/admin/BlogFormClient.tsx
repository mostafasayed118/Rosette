'use client';

import dynamic from 'next/dynamic';
import type { BlogPostInput } from '@/features/blog/types';

const BlogForm = dynamic(() => import('@/components/admin/BlogForm').then((m) => m.BlogForm), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded bg-muted" />,
});

type BlogFormClientProps = {
  post: BlogPostInput;
  id?: string;
  authors?: { id: string; nameEn: string }[];
};

export default function BlogFormClient({ post, id, authors }: BlogFormClientProps) {
  return <BlogForm post={post} id={id} authors={authors} />;
}
