import { localAuthors, localPosts } from './data';
import type { Author, BlogListQuery, BlogPost, BlogRepository, BlogPostSummary } from './types';

function toSummary(post: BlogPost): BlogPostSummary {
  return {
    id: post.id,
    slug: post.slug,
    type: post.type,
    cityCode: post.cityCode,
    authorId: post.authorId,
    titleEn: post.titleEn,
    titleAr: post.titleAr,
    titleFr: post.titleFr,
    excerptEn: post.excerptEn,
    excerptAr: post.excerptAr,
    excerptFr: post.excerptFr,
    category: post.category,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  };
}

export const localBlogRepository: BlogRepository = {
  async listPublished(query?: BlogListQuery) {
    return localPosts
      .filter((post) => post.published)
      .filter((post) => (query?.type ? post.type === query.type : true))
      .filter((post) => (query?.cityCode ? post.cityCode === query.cityCode : true))
      .filter((post) => (query?.authorId ? post.authorId === query.authorId : true))
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .map(toSummary);
  },
  async getBySlug(slug: string) {
    return localPosts.find((post) => post.slug === slug && post.published) ?? null;
  },
  async listAuthors() {
    return localAuthors;
  },
  async getAuthor(id: string) {
    return localAuthors.find((author) => author.id === id) ?? null;
  },
  async getAuthorBySlug(slug: string) {
    return localAuthors.find((author) => author.slug === slug) ?? null;
  },
};
