import { describe,it,expect } from 'vitest';
import { z } from 'zod';
const picksSchema = z.object({ limit: z.coerce.number().int().min(1).max(12).default(8), excludeSlug: z.string().max(80).optional(), locale: z.enum(['en','ar','fr']).default('en') });
describe('validation',()=>{ it('rejects limit 99',()=>{ expect(picksSchema.safeParse({limit:99}).success).toBe(false)}); it('accepts ar',()=>{ expect(picksSchema.parse({locale:'ar'}).locale).toBe('ar')});});
