import type { CheckoutErrors, CheckoutInput } from './types';

export function validateCheckout(input: CheckoutInput): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (!input.recipientName.trim()) errors.recipientName = 'Recipient name is required.';
  if (!input.recipientPhone.trim()) errors.recipientPhone = 'Recipient phone is required.';
  if (!input.address.trim()) errors.address = 'Delivery address is required.';
  if (!input.senderName.trim()) errors.senderName = 'Sender name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.senderEmail.trim())) errors.senderEmail = 'Enter a valid email address.';
  if (!input.deliveryDate) errors.deliveryDate = 'Choose a delivery date.';
  if (!input.deliveryWindow) errors.deliveryWindow = 'Choose a delivery window.';
  return errors;
}
