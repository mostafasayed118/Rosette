'use client';

import * as React from "react"

const MOBILE_BREAKPOINT_PX = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`

let cachedQuery: MediaQueryList | null = null

function getQuery(): MediaQueryList | null {
  if (!cachedQuery && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    cachedQuery = window.matchMedia(QUERY)
  }
  return cachedQuery
}

function subscribe(onChange: () => void): () => void {
  const query = getQuery()
  if (!query) return () => {}
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/**
 * True when the viewport is narrower than the mobile breakpoint.
 *
 * `useSyncExternalStore` subscribes to media-query changes instead of racing a
 * mount effect, so SSR renders `false` exactly once and there is no
 * setState-in-effect cascade on hydration.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => getQuery()?.matches ?? false,
    () => false,
  )
}

