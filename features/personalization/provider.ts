import { createLocalPersonalizationRepository } from './local-repository';
import { createSupabasePersonalizationRepository } from './supabase-repository';
import { products } from '@/features/catalog/data';
import { createClient } from '@/lib/supabase/server';
import type { PersonalizationRepository } from './types';
export function getPersonalizationProvider(): PersonalizationRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(url && key){ try{ const supabase = createClient(); return createSupabasePersonalizationRepository(supabase as any); }catch{} }
  return createLocalPersonalizationRepository({ products, orderSlugsFor: async()=>[], wishlistFor: async()=>[] });
}
