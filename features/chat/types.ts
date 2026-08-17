export type ChatTopic = 'store' | 'unsupported' | 'order_lookup' | 'support';
export type ChatAction = 'none' | 'show_products' | 'lookup_order' | 'whatsapp';
export type ChatResponse = { answer: string; language: 'ar' | 'en'; action: ChatAction; productSlugs?: string[]; requiresHuman?: boolean };
