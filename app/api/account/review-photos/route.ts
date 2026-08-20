import { NextResponse } from 'next/server';
import { uploadReviewPhotos, validateReviewPhotos, type ReviewPhotoInput } from '@/features/reviews/review-storage';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  const files = formData.getAll('photos').filter((value): value is File => typeof File !== 'undefined' && value instanceof File);
  const inputs: ReviewPhotoInput[] = await Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, size: file.size, bytes: await file.arrayBuffer() })));
  const validation = validateReviewPhotos(inputs);
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });
  try {
    const { urls } = await uploadReviewPhotos(getAdminSupabase().storage, validation.photos);
    return NextResponse.json({ urls }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Could not upload photos' }, { status: 500 });
  }
}
