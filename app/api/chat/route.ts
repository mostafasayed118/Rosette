import { NextResponse } from 'next/server';
import { answerStoreQuestion } from '@/features/chat/groq-assistant';

const MAX_MESSAGE_LENGTH = 500;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; language?: unknown };
    if (typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: 'Message must be between 1 and 500 characters.' }, { status: 400 });
    const language = body.language === 'ar' ? 'ar' : body.language === 'fr' ? 'fr' : 'en';
    return NextResponse.json(await answerStoreQuestion({ message: body.message.trim(), language }));
  } catch {
    return NextResponse.json({ error: 'Chat is temporarily unavailable.' }, { status: 503 });
  }
}
