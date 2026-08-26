'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Kind = 'product' | 'avatar' | 'cover';

type ImagePreviewProps = {
  url?: string | null;
  kind?: Kind;
  width?: number;
  height?: number;
  fallback?: ReactNode;
};

const DEFAULT_SIZES: Record<Kind, { width: number; height: number; radius: string }> = {
  product: { width: 96, height: 96, radius: 'rounded-md' },
  avatar: { width: 64, height: 64, radius: 'rounded-full' },
  cover: { width: 96, height: 96, radius: 'rounded-md' },
};

export function ImagePreview({ url, kind = 'product', width, height, fallback }: ImagePreviewProps) {
  const defaults = DEFAULT_SIZES[kind];
  const w = width ?? defaults.width;
  const h = height ?? defaults.height;
  const radius = defaults.radius;

  if (!url) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', radius)} style={{ width: w, height: h }}>
        {fallback}
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      role="img"
      width={w}
      height={h}
      className={cn(radius, 'object-cover')}
      sizes={`${w}px`}
    />
  );
}
