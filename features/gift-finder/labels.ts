import type { QuizReason } from './types';

/** Map a quiz reason to the i18n key for its chip label. */
export function giftFinderReasonKey(reason: QuizReason): string {
  switch (reason) {
    case 'recipient': return 'giftFinderReasonRecipient';
    case 'occasion': return 'giftFinderReasonOccasion';
    case 'color': return 'giftFinderReasonColor';
    case 'style': return 'giftFinderReasonStyle';
  }
}
