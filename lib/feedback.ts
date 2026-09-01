"use client"

import { toast as sonnerToast } from "sonner"

type RosetteToastAction = {
  label: string
  onClick: () => void
}

type RosetteToastOptions = {
  description?: string
  duration?: number
  dismissible?: boolean
  action?: RosetteToastAction
  cancel?: RosetteToastAction
  id?: string | number
}

/**
 * Rosette floral toast presets — thin wrapper over `sonner` that
 * keeps the Rosette editorial voice + a11y defaults.
 *
 * Reuses the project's floral tokens ( --color-brand, --color-surface,
 * --color-ink, Fraunces/Outfit) defined in `app/globals.css` and the
 * `components/ui/sonner.tsx` Toaster. No extra package needed.
 *
 * Usage:
 *   import { rosetteToast } from "@/lib/feedback"
 *   rosetteToast.success("Added to bag", { description: "Rose Hour · 2 stems → Cairo" })
 *   rosetteToast.error("Couldn’t save", { description: "Please try again." })
 */
function withDefaults(
  title: string,
  opts: RosetteToastOptions | undefined,
  baseDuration: number
) {
  const hasAction = Boolean(opts?.action || opts?.cancel)
  // Give the reader time to parse action labels — +1.2s when an action is present
  const duration = opts?.duration ?? (hasAction ? baseDuration + 1200 : baseDuration)
  return {
    description: opts?.description,
    duration,
    dismissible: opts?.dismissible ?? true,
    action: opts?.action
      ? { label: opts.action.label, onClick: opts.action.onClick }
      : undefined,
    cancel: opts?.cancel
      ? { label: opts.cancel.label, onClick: opts.cancel.onClick }
      : undefined,
    id: opts?.id,
  }
}

export const rosetteToast = {
  /** Editorial success — sage accent, Heart/Check icon */
  success(title: string, opts?: RosetteToastOptions) {
    return sonnerToast.success(title, withDefaults(title, opts, 3400))
  },
  /** Editorial error — rose/danger accent (keeps longer for reading) */
  error(title: string, opts?: RosetteToastOptions) {
    return sonnerToast.error(title, withDefaults(title, opts, 4400))
  },
  /** Info / bloom — brand accent + Flower icon */
  info(title: string, opts?: RosetteToastOptions) {
    return sonnerToast.info(title, withDefaults(title, opts, 3800))
  },
  /** Warning — amber accent */
  warning(title: string, opts?: RosetteToastOptions) {
    return sonnerToast.warning(title, withDefaults(title, opts, 4000))
  },
  /** Loading — muted, will be replaced by success/error via id (no auto-dismiss) */
  loading(title: string, opts?: RosetteToastOptions) {
    return sonnerToast.loading(title, {
      ...withDefaults(title, opts, 60000),
      duration: opts?.duration ?? Infinity,
    })
  },
  /** Neutral default */
  message(title: string, opts?: RosetteToastOptions) {
    return sonnerToast(title, withDefaults(title, opts, 3400))
  },
  /** Dismiss a toast by id, or all if no id */
  dismiss(id?: string | number) {
    return sonnerToast.dismiss(id)
  },
  /** Promise helper with floral wording */
  promise<T>(
    promise: Promise<T>,
    msgs: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) },
    opts?: RosetteToastOptions
  ) {
    return sonnerToast.promise(promise, {
      loading: msgs.loading,
      success: msgs.success,
      error: msgs.error,
      description: opts?.description,
      duration: opts?.duration,
    })
  },
} as const

/** Convenience presets tied to Rosette domain actions */
export const feedback = {
  cartAdded(productName: string, quantity: number, opts?: { actionLabel?: string; onAction?: () => void; description?: string }) {
    return rosetteToast.success("Added to bag", {
      description: opts?.description ?? `${productName} · ${quantity} ${quantity === 1 ? "stem" : "stems"}`,
      action: opts?.onAction ? { label: opts.actionLabel ?? "View bag", onClick: opts.onAction } : undefined,
    })
  },
  cartRemoved(productName?: string) {
    return rosetteToast.message("Removed from bag", {
      description: productName ? `${productName} removed` : undefined,
    })
  },
  wishlistAdded(productName?: string) {
    return rosetteToast.success("Saved to wishlist", {
      description: productName ? `${productName} saved — we’ll watch the price for you` : "We’ll watch the price for you",
    })
  },
  wishlistRemoved(productName?: string) {
    return rosetteToast.message("Removed from wishlist", {
      description: productName,
    })
  },
  wishlistPriceWatchEnabled() {
    return rosetteToast.info("Price watch on", {
      description: "We’ll email you if the price drops or it’s back in stock.",
    })
  },
  orderPlaced(orderNumber?: string) {
    return rosetteToast.success("Order placed — thank you", {
      description: orderNumber ? `Order ${orderNumber} · we’re preparing your stems` : "We’re preparing your stems with care.",
      duration: 4200,
    })
  },
  copied(label = "Copied") {
    return rosetteToast.message(label, { duration: 2000 })
  },
  linkCopied() {
    return rosetteToast.success("Link copied", { description: "Share the bloom with someone thoughtful." })
  },
  comingSoon(feature = "This feature") {
    return rosetteToast.info(`${feature} — coming soon`, {
      description: "We’re pruning this corner of the atelier.",
    })
  },
  errorGeneric(msg = "Something went wrong", description = "Please try again in a moment.") {
    return rosetteToast.error(msg, { description })
  },
} as const

// Re-export raw sonner toast for advanced cases (keeps compatibility with useAsyncAction.ts)
export { sonnerToast as toast }
export type { RosetteToastOptions, RosetteToastAction }
