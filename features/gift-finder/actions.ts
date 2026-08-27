'use server';

import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCatalogRepository } from '@/features/catalog/provider';
import { completeGiftFinderFor } from './action-internals';
import type { GiftFinderOutcome } from './types';

export async function completeGiftFinder(
  answers: Record<string, unknown>,
  sessionId: string,
): Promise<GiftFinderOutcome | 'invalid'> {
  const customer = await getCurrentCustomer();
  return completeGiftFinderFor({
    answers,
    sessionId,
    customer,
    catalogRepo: getCatalogRepository(),
    client: getAdminSupabase(),
  });
}
