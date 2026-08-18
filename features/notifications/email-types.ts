export type EmailLocale = 'en' | 'ar' | 'fr';
export type NotificationType = 'order_received' | 'payment_confirmed' | 'payment_failed' | 'preparing' | 'out_for_delivery' | 'delivered';
export type OrderNotificationInput = { locale: EmailLocale; type: NotificationType; orderNumber: string; totalMinor: number; recipientEmail?: string; orderUrl: string };
