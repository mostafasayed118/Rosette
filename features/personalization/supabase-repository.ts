import type { PersonalizationRepository } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapRowToProduct } from '@/features/catalog/row-mappers';
export function createSupabasePersonalizationRepository(supabase: SupabaseClient): PersonalizationRepository {
  return {
    async getPicks(customerId, query){
      const limit = Math.min(Math.max(query.limit ?? 8,1),12);
      const { data, error } = await supabase.rpc('get_personalized_picks', { p_customer_id: customerId, p_limit: limit, p_exclude_slug: query.excludeSlug ?? null });
      if(error) throw error;
      const slugs: string[] = (data as {slug:string}[]).map(r=>r.slug);
      if(slugs.length===0) return { buyAgain:[], recommended:[], reason:'fallback' };
      const { data: rows } = await supabase.from('products').select('*').in('slug', slugs).eq('active', true);
      const bySlug = new Map((rows||[]).map(r=>[r.slug, mapRowToProduct(r)]));
      const ordered = slugs.map(s=>bySlug.get(s)).filter(Boolean) as import('@/features/catalog/types').Product[];
      // RPC already encodes reason; re-derive split via original data reason field
      const reasons = new Map((data as {slug:string;reason:string}[]).map(r=>[r.slug,r.reason]));
      const buyAgain = ordered.filter(p=>reasons.get(p.slug)==='buy_again');
      const recommended = ordered.filter(p=>reasons.get(p.slug)!=='buy_again');
      // pad if needed (provider level)
      if(ordered.length < limit){
        const { data: fall } = await supabase.from('products').select('*').eq('active',true).order('created_at',{ascending:false}).limit(limit - ordered.length);
        const fp = (fall||[]).map(mapRowToProduct).filter(p=>!bySlug.has(p.slug) && p.slug!==query.excludeSlug);
        recommended.push(...fp);
      }
      return { buyAgain, recommended, reason: buyAgain.length||recommended.some(p=>reasons.get(p.slug)==='affinity') ? 'history':'fallback' };
    }
  };
}
