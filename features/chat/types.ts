export type ChatTopic = 'store' | 'unsupported' | 'order_lookup' | 'support';
export type ChatAction = 'none' | 'show_products' | 'lookup_order' | 'whatsapp';
export type ChatResponse = { answer: string; language: 'en' | 'ar' | 'fr'; action: ChatAction; productSlugs?: string[]; requiresHuman?: boolean };
