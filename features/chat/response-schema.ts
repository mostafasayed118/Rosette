import type { ChatResponse } from './types';

const actions = new Set(['none', 'show_products', 'lookup_order', 'whatsapp']);

export function parseChatResponse(value: unknown): ChatResponse | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.answer !== 'string' || candidate.answer.length === 0 || candidate.answer.length > 1000) return null;
  if (candidate.language !== 'en' && candidate.language !== 'ar') return null;
  if (typeof candidate.action !== 'string' || !actions.has(candidate.action)) return null;
  if (candidate.productSlugs !== undefined && (!Array.isArray(candidate.productSlugs) || candidate.productSlugs.some((slug) => typeof slug !== 'string'))) return null;
  if (candidate.requiresHuman !== undefined && typeof candidate.requiresHuman !== 'boolean') return null;
  return { answer: candidate.answer, language: candidate.language, action: candidate.action as ChatResponse['action'], ...(candidate.productSlugs ? { productSlugs: candidate.productSlugs as string[] } : {}), ...(typeof candidate.requiresHuman === 'boolean' ? { requiresHuman: candidate.requiresHuman } : {}) };
}
