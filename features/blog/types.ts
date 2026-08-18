export type BlogPostType = 'post' | 'city';

export type Author = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr?: string;
  nameFr?: string;
  roleEn?: string;
  roleAr?: string;
  roleFr?: string;
  bioEn?: string;
  bioAr?: string;
  bioFr?: string;
  avatarUrl?: string;
};

export type AuthorInput = {
  slug: string;
  nameEn: string;
  nameAr?: string;
  nameFr?: string;
  roleEn?: string;
  roleAr?: string;
  roleFr?: string;
  bioEn?: string;
  bioAr?: string;
  bioFr?: string;
  avatarUrl?: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  type: BlogPostType;
  cityCode: string | null;
  authorId: string | null;
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
  authorId: string | null;
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
  authorId?: string | null;
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

export type BlogListQuery = { type?: BlogPostType; cityCode?: string };export interface BlogRepository {
  listPublished(query?: BlogListQuery): Promise<BlogPostSummary[]>;
  getBySlug(slug: string): Promise<BlogPost | null>;
  listAuthors(): Promise<Author[]>;
  getAuthor(id: string): Promise<Author | null>;
}
