'use client';

import dynamic from 'next/dynamic';

// The chat widget is interactive-only and below the fold; splitting it keeps
// its Groq/UI chunk out of every page's initial bundle.
const ChatWidget = dynamic(
  () => import('@/features/chat/ChatWidget').then((mod) => mod.ChatWidget),
  { ssr: false, loading: () => null },
);

export function ChatWidgetLazy({ whatsappNumber }: { whatsappNumber?: string }) {
  return <ChatWidget whatsappNumber={whatsappNumber} />;
}
