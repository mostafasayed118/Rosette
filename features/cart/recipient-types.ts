export type CartRecipient = {
  id: string;
  label?: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  deliveryDate: string;
  deliveryWindow: string;
};

export const MAX_GROUPS = 10;

export function createRecipientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}