export type BlogPostType = 'post' | 'city';

export type BlogPost = {
  id: string;
  slug: string;
  type: BlogPostType;
  cityCode: string | null;
  titleEn: string;
  titleAr?: string;
  titleFr?: string;
  excerptEn?: string;
  excerptAr?: string;
  excerptFr?: string;
  contentEn: string;
  contentAr?: string;
  contentFr?: string;
  category?: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogPostSummary = {
  id: string;
  slug: string;
  type: BlogPostType;
  cityCode: string | null;
  titleEn: string;
  titleAr?: string;
  titleFr?: string;
  excerptEn?: string;
  excerptAr?: string;
  excerptFr?: string;
  category?: string;
  publishedAt: string | null;
  updatedAt: string;
};

export type BlogPostInput = {
  slug: string;
  type: BlogPostType;
  cityCode?: string | null;
  titleEn: string;
  titleAr?: string;
  titleFr?: string;
  excerptEn?: string;
  excerptAr?: string;
  excerptFr?: string;
  contentEn: string;
  contentAr?: string;
  contentFr?: string;
  category?: string;
  published: boolean;
};

export type BlogListQuery = { type?: BlogPostType; cityCode?: string };

export interface BlogRepository {
  listPublished(query?: BlogListQuery): Promise<BlogPostSummary[]>;
  getBySlug(slug: string): Promise<BlogPost | null>;
}
