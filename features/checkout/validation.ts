import { checkDeliveryDate } from '@/features/delivery/eligibility';
import type { CheckoutErrors, CheckoutInput } from './types';

export function validateCheckout(input: CheckoutInput, options?: { multiRecipient?: boolean }): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (!options?.multiRecipient) {
    if (!input.recipientName.trim()) errors.recipientName = 'Recipient name is required.';
    if (!input.recipientPhone.trim()) errors.recipientPhone = 'Recipient phone is required.';
    if (!input.address.trim()) errors.address = 'Delivery address is required.';
    if (!input.deliveryDate) {
      errors.deliveryDate = 'Choose a delivery date.';
    } else {
      const dateCheck = checkDeliveryDate(input.deliveryDate);
      if (!dateCheck.eligible) {
        errors.deliveryDate = dateCheck.reason === 'closed_weekday'
          ? 'Our studio rests on Fridays. Choose another day.'
          : 'Choose a valid delivery date.';
      }
    }
    if (!input.deliveryWindow) errors.deliveryWindow = 'Choose a delivery window.';
  }
  if (!input.senderName.trim()) errors.senderName = 'Sender name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.senderEmail.trim())) errors.senderEmail = 'Enter a valid email address.';
  return errors;
}
