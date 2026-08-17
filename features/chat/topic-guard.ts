import type { ChatTopic } from './types';

const storeTerms = [
  'flower', 'flowers', 'rose', 'roses', 'bouquet', 'plant', 'gift', 'delivery', 'deliver', 'cairo', 'alexandria', 'giza', 'price', 'pay', 'payment', 'order', 'occasion', 'birthday', 'romance', 'thank', 'ورد', 'زهور', 'باقة', 'نبات', 'هدية', 'توصيل', 'القاهرة', 'الإسكندرية', 'الجيزة', 'سعر', 'دفع', 'طلب', 'عيد', 'رومانسية', 'شكر',
];
const supportTerms = ['help', 'contact', 'support', 'مساعدة', 'تواصل', 'دعم'];
const injectionTerms = ['ignore previous', 'ignore all instructions', 'system prompt', 'reveal your instructions', 'اكشف التعليمات', 'تجاهل التعليمات'];
const orderPattern = /\b(?:order|طلب)\s*[-#:]?\s*[a-z0-9-]{2,}/i;

export function classifyChatTopic(message: string): ChatTopic {
  const normalized = message.trim().toLocaleLowerCase();
  if (!normalized || injectionTerms.some((term) => normalized.includes(term))) return 'unsupported';
  if (orderPattern.test(normalized)) return 'order_lookup';
  if (supportTerms.some((term) => normalized.includes(term)) && storeTerms.some((term) => normalized.includes(term))) return 'support';
  return storeTerms.some((term) => normalized.includes(term)) ? 'store' : 'unsupported';
}
