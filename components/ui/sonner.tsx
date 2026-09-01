"use client"

import {
  CircleCheckIcon,
  Flower2Icon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "@/features/theme/ThemeProvider"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      expand={false}
      visibleToasts={4}
      closeButton
      gap={12}
      offset={16}
      toastOptions={{
        duration: 3600,
        classNames: {
          toast:
            "group rosette-toast pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-[16px] border bg-[var(--color-surface)] p-[14px] pr-10 shadow-[0_16px_40px_rgba(58,20,30,0.12),0_4px_12px_rgba(58,20,30,0.08)] backdrop-blur-xl data-[type=success]:border-[var(--color-success-token)]/20 data-[type=error]:border-[var(--color-danger)]/20 data-[type=warning]:border-[var(--color-warning-token)]/20 data-[type=info]:border-[var(--color-brand)]/20",
          title:
            "font-display text-[13.5px] font-semibold leading-none tracking-[-0.01em] text-[var(--color-ink)]",
          description:
            "font-body text-[12.5px] leading-[1.5] text-[var(--color-ink-muted)]",
          icon: "rosette-toast-icon mt-[1px] shrink-0",
          closeButton:
            "rosette-toast-close absolute right-2 top-2 size-7 rounded-full border border-black/5 bg-[var(--color-surface-container)] text-[var(--color-ink-muted)] opacity-0 transition-all hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-ink)] focus-visible:opacity-100 group-hover:opacity-100 group-data-[expanded=true]:opacity-100",
          actionButton:
            "h-8 rounded-full bg-[var(--color-brand)] px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-brand-hover)]",
          cancelButton:
            "h-8 rounded-full border border-[var(--rt-outline-variant)]/20 bg-[var(--color-surface-container)] px-3.5 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-container-high)]",
          success: "rosette-toast--success",
          error: "rosette-toast--error",
          warning: "rosette-toast--warning",
          info: "rosette-toast--info",
          loading: "rosette-toast--loading",
          default: "rosette-toast--default",
        },
        style: {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-ink)",
          "--normal-border": "color-mix(in oklch, var(--rt-outline-variant) 18%, transparent)",
          "--border-radius": "16px",
        } as React.CSSProperties,
      }}
      icons={{
        success: <CircleCheckIcon className="size-[18px]" />,
        info: <Flower2Icon className="size-[18px]" />,
        warning: <TriangleAlertIcon className="size-[18px]" />,
        error: <OctagonXIcon className="size-[18px]" />,
        loading: <Loader2Icon className="size-[18px] animate-spin" />,
        // default icon for toast without type (used for custom)
        close: undefined,
      }}
      style={
        {
          "--width": "380px",
          "--mobile-offset": "16px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

// Re-export floral presets for programmatic use
export const ROSETTE_TOAST_ICONS = {
  bloom: Flower2Icon,
  sparkle: SparklesIcon,
  info: InfoIcon,
} as const
