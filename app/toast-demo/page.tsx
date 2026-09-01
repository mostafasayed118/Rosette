"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Flower2,
  Heart,
  ShoppingBag,
  Copy,
  Sparkles,
  Check,
  AlertCircle,
  CircleCheck,
  Info,
  TriangleAlert,
  OctagonX,
  Loader2,
  Sun,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { rosetteToast, feedback } from "@/lib/feedback"
import { useTheme } from "@/features/theme/ThemeProvider"

function MockToast({
  type,
  title,
  description,
  icon,
}: {
  type: "success" | "error" | "warning" | "info" | "default"
  title: string
  description: string
  icon: React.ReactNode
}) {
  const accent: Record<string, string> = {
    success: "var(--color-success-token)",
    error: "var(--color-danger)",
    warning: "var(--color-warning-token)",
    info: "var(--color-brand)",
    default: "var(--color-brand)",
  }
  const bg: Record<string, string> = {
    success: "color-mix(in oklch, var(--color-success-token) 14%, var(--color-surface))",
    error: "color-mix(in oklch, var(--color-danger) 12%, var(--color-surface))",
    warning: "color-mix(in oklch, var(--color-warning-token) 14%, var(--color-surface))",
    info: "var(--color-brand-soft)",
    default: "var(--color-brand-soft)",
  }
  const col: Record<string, string> = {
    success: "var(--color-success-token)",
    error: "var(--color-danger)",
    warning: "var(--color-warning-token)",
    info: "var(--color-brand)",
    default: "var(--color-brand)",
  }
  return (
    <div
      className="pointer-events-none relative flex w-full items-start gap-3 overflow-hidden rounded-[16px] border bg-[var(--color-surface)] p-[14px] pr-10 backdrop-blur-xl"
      style={{
        borderColor: "color-mix(in oklch, var(--rt-outline-variant) 18%, transparent)",
        boxShadow: "0 16px 40px -12px rgb(58 20 30 / 14%), 0 4px 16px -4px rgb(58 20 30 / 10%), 0 0 0 1px rgb(58 20 30 / 04%)",
      }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent[type] }} />
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full border text-[var(--toast-icon-color)]"
        style={
          {
            background: bg[type],
            color: col[type],
            borderColor: `color-mix(in oklch, ${col[type]} 14%, transparent)`,
          } as React.CSSProperties
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[13.5px] font-semibold leading-none tracking-[-0.01em] text-[var(--color-ink)]">{title}</span>
        <span className="mt-1 block font-body text-[12.5px] leading-[1.5] text-[var(--color-ink-muted)]">{description}</span>
      </span>
    </div>
  )
}

export default function ToastDemoPage() {
  const [loading, setLoading] = useState(false)
  const { theme, setTheme } = useTheme()
  const [copied, setCopied] = useState(false)

  const code = `import { rosetteToast } from "@/lib/feedback"
import { feedback } from "@/lib/feedback"

// success with action
rosetteToast.success("Added to bag", {
  description: "Rose Hour · ×2 · EGP 1,240",
  action: { label: "View bag", onClick: () => router.push("/cart") },
})

// domain preset
feedback.wishlistAdded("Rose Hour")`

  return (
    <main className="min-h-screen bg-[var(--color-canvas)]">
      {/* Sticky editorial header */}
      <div className="sticky top-0 z-30 border-b border-[var(--rt-outline-variant)]/12 bg-[var(--color-surface)]/72 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--color-surface)]/60">
        <div className="mx-auto flex w-[min(calc(100%-2rem),72rem)] items-center justify-between py-4">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-[var(--color-brand)] text-white shadow-sm">
              <Flower2 className="size-4" />
            </span>
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
              Rosette <span className="font-normal text-[var(--color-ink-muted)]">— atelier</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
              className="grid size-9 place-items-center rounded-full border border-[var(--rt-outline-variant)]/20 bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--rt-outline-variant)]/20 bg-[var(--color-surface)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-container)] transition-colors"
            >
              Back to store
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-[min(calc(100%-2rem),72rem)] pb-16 pt-8 md:pt-10">
        {/* Hero — tighter editorial, more air */}
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="max-w-[36rem]">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--rt-outline-variant)]/16 bg-[var(--color-surface)] px-3 py-1 text-xs font-medium tracking-wide text-[var(--color-sage-ink-token)] shadow-sm">
              <span className="size-1.5 rounded-full bg-[var(--color-success-token)] animate-pulse" />
              Floral feedback · live at /toast-demo
            </p>
            <h1 className="mt-4 font-display text-[36px] font-semibold leading-[0.9] tracking-[-0.03em] text-[var(--color-ink)] md:text-[46px]">
              Quiet notifications,
              <br />
              <span className="font-normal italic text-[var(--color-ink-muted)]">with a little bloom.</span>
            </h1>
            <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-[var(--color-ink-muted)]">
              Rosette&apos;s toasts reuse the atelier palette —{" "}
              <span className="rounded-full bg-[var(--color-brand-soft)] px-2 py-0.5 font-medium text-[var(--color-brand)]">deep rose #8e1a3f</span>{" "}
              + sage on warm paper{" "}
              <span className="rounded bg-[var(--color-surface-container)] px-1.5 py-0.5 font-mono text-xs">#fdf6f0</span>.
              <br className="hidden sm:block" />
              Paper-textured &amp; blurred, 3px bloom bar + 28px tinted badge. Top-center, 380px, pause on hover.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-ink-muted)]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--rt-outline-variant)]/15 px-2.5 py-1">
                <span className="size-1.5 rounded-full bg-[var(--color-brand)]" /> Fraunces + Outfit
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--rt-outline-variant)]/15 px-2.5 py-1">
                prefers-reduced-motion ✓
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--rt-outline-variant)]/15 px-2.5 py-1">
                44px close target
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--rt-outline-variant)]/15 px-2.5 py-1">
                RTL ready
              </span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-muted)]">
              Built on <code className="rounded bg-[var(--color-surface-container)] px-1.5 py-0.5 font-mono text-[11px]">sonner 2.0</code>{" "}
              (already in the project) — no new package. Styled in{" "}
              <code className="rounded bg-[var(--color-surface-container)] px-1 py-0.5 font-mono text-[11px]">components/ui/sonner.tsx</code>{" "}
              + <code className="rounded bg-[var(--color-surface-container)] px-1 py-0.5 font-mono text-[11px]">app/globals.css</code>.
            </p>
          </div>

          {/* Static preview — instant visual without clicking */}
          <div className="grid gap-3 rounded-[20px] border border-[var(--rt-outline-variant)]/14 bg-[var(--color-surface-container-low)]/70 p-4 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">Static preview — what the toast looks like</p>
            <MockToast type="success" title="Added to bag" description="Rose Hour · ×2 · EGP 1,240 — View bag action on the right" icon={<CircleCheck className="size-4" />} />
            <MockToast type="info" title="Price watch on" description="We’ll email you if Rose Hour drops or is back in stock." icon={<Flower2 className="size-4" />} />
            <MockToast type="warning" title="Only 2 left in stock" description="Rose Hour — order before 3pm for same-day." icon={<TriangleAlert className="size-4" />} />
            <MockToast type="error" title="Couldn’t save the bouquet" description="Please check your connection and try again." icon={<OctagonX className="size-4" />} />
            <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
              Left bloom bar + circular badge tinted per type. Warm paper at 92% + 16px blur/saturate, 16px radius, layered shadow. Try the live buttons below — they trigger the real Sonner toaster.
            </p>
          </div>
        </div>

        {/* Live interactive */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
          <Card className="overflow-hidden rounded-[20px] border-[var(--rt-outline-variant)]/14 bg-[var(--color-surface)] shadow-[0_16px_40px_rgba(58,20,30,0.08),0_4px_12px_rgba(58,20,30,0.06)]">
            <CardHeader className="border-b border-[var(--rt-outline-variant)]/8 bg-[var(--color-surface-container-low)]/60 py-4">
              <CardTitle className="font-display text-[17px] tracking-[-0.01em]">Try the bouquet — live</CardTitle>
              <CardDescription className="text-[13px]">Top-center, 380px, pause on hover, swipe to dismiss, close on 44px target. Try on mobile too.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Button
                  onClick={() =>
                    rosetteToast.success("Added to bag", {
                      description: "Rose Hour · ×2 — Cairo · EGP 1,240",
                      action: { label: "View bag", onClick: () => rosetteToast.message("View bag — demo", { description: "In the shop, this opens /cart." }) },
                    })
                  }
                  className="justify-start gap-2 rounded-full"
                >
                  <ShoppingBag className="size-4" /> Success
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => rosetteToast.error("Couldn’t save the bouquet", { description: "Please check your connection and try again." })}
                >
                  <AlertCircle className="size-4" /> Error
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => rosetteToast.warning("Only 2 left in stock", { description: "Rose Hour — order before 3pm for same-day." })}>
                  Warning
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => rosetteToast.info("Price watch on", { description: "We’ll email you if Rose Hour drops or is back in stock." })}
                >
                  <Flower2 className="size-4" /> Info / Bloom
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    rosetteToast.message("Link copied", { description: "Share the bloom with someone thoughtful." })
                    navigator.clipboard?.writeText(window.location.href).catch(() => {})
                  }}
                >
                  <Copy className="size-4" /> Message
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={loading}
                  onClick={() => {
                    setLoading(true)
                    const p = new Promise<string>((res) => setTimeout(() => res("done"), 1650))
                    rosetteToast.promise(p, { loading: "Preparing your stems…", success: "Ready — hand-tied with care.", error: "Couldn’t prepare" })
                    p.finally(() => setLoading(false))
                  }}
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null} {loading ? "Loading…" : "Promise"}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button variant="outline" className="justify-start rounded-full" onClick={() => feedback.wishlistAdded("Rose Hour")}>
                  <Heart className="size-4" /> Wishlist added
                </Button>
                <Button variant="outline" className="justify-start rounded-full" onClick={() => feedback.wishlistRemoved("Rose Hour")}>
                  Wishlist removed
                </Button>
                <Button
                  variant="outline"
                  className="justify-start rounded-full"
                  onClick={() => rosetteToast.success("Order placed — thank you", { description: "Order # 4821 · we’re preparing your stems", duration: 4200 })}
                >
                  <Check className="size-4" /> Order placed
                </Button>
                <Button
                  variant="outline"
                  className="justify-start rounded-full"
                  onClick={() => rosetteToast.success("Saved — we’ll hold this for you", { description: "Abandoned bag reminder set." })}
                >
                  <Sparkles className="size-4" /> Bag saved
                </Button>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-dashed border-[var(--rt-outline-variant)]/18 bg-[var(--color-surface-container-low)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">How it’s wired</p>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(code).catch(() => {})
                      setCopied(true)
                      rosetteToast.message("Copied", { description: "Snippet copied to clipboard." })
                      window.setTimeout(() => setCopied(false), 1600)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--color-ink)]/90 transition-colors"
                  >
                    <Copy className="size-3" /> {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="mt-3 overflow-auto rounded-lg bg-[var(--color-ink)] p-3 text-[11.5px] leading-relaxed text-[var(--color-surface)]">
{code}
                </pre>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            <Card className="rounded-[20px] border-[var(--rt-outline-variant)]/14 bg-[var(--color-surface)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 font-display text-[16px]">
                  <Sparkles className="size-4 text-[var(--color-brand)]" /> Anatomy
                </CardTitle>
                <CardDescription>Editorial, not system. 12px gap, 14/16 padding.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {[
                  ["3px bloom bar", "Left accent in variant color (sage/rose/amber/brand).", "bg-[var(--color-brand)]"],
                  ["28px tinted badge", "Circular icon on soft tint + 1px ring.", "bg-[var(--color-accent)]"],
                  ["Warm paper", "92% surface + 16px blur/saturate, 16px radius, triple shadow.", "bg-[var(--color-surface-container)]"],
                  ["Fraunces + Outfit", "13.5px semibold title, 12.5px muted body, 2px gap.", "bg-[var(--color-ink)]"],
                  ["A11y · 44px", "aria-live polite, focus ring, pointer:coarse shows close.", "bg-[var(--rt-outline-variant)]"],
                ].map(([title, desc, dot]) => (
                  <div key={title} className="flex gap-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
                    <p>
                      <strong className="font-medium text-[var(--color-ink)]">{title}</strong> — {desc}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[20px] border-[var(--rt-outline-variant)]/14 bg-[var(--color-surface-container-low)]/70">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-[16px]">Where it’s used</CardTitle>
                <CardDescription>Every key action now has quiet, consistent feedback.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2.5 text-sm text-[var(--color-ink-muted)]">
                <p>
                  <span className="font-medium text-[var(--color-ink)]">ProductDetail</span> — Add to bag → success + &ldquo;View bag&rdquo; (×qty, price) + button turns sage for 2.6s.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-ink)]">WishlistHeart</span> — Heart pop (420ms) + haptic → saved / removed with product name.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-ink)]">ProductCard</span> — Same wishlist preset, now with name passed for precise toast.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-ink)]">Bag</span> — Remove → neutral + Undo restores line; quantity changes stay quiet.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-ink)]">SaveBagField</span> — Inline validation stays inline; success/error uses toast.
                </p>
                <p>
                  <span className="font-medium text-[var(--color-ink)]">useAsyncAction</span> — Admin async actions already call toast → now floral skin, longer when action present.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[20px] border-[var(--rt-outline-variant)]/14 bg-[var(--color-surface)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[14px] font-semibold">
                  <Info className="size-4 text-[var(--color-ink-muted)]" /> Details for reviewers
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                <p>
                  Colors are <code className="rounded bg-[var(--color-surface-container)] px-1 py-0.5">color-mix</code> of tokens — no hard-coded hex in toasts, so light/dark switch is automatic.
                </p>
                <p>
                  Durations: success 3400ms (+1200ms with action), error 4400ms, info 3800ms, warning 4000ms. Reduced-motion disables pop &amp; blur transitions.
                </p>
                <p>
                  RTL: <code className="rounded bg-[var(--color-surface-container)] px-1 py-0.5">html[lang=&quot;ar&quot;]</code> flips bar, padding, close &amp; direction.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { name: "brand", hex: "#8e1a3f", var: "--color-brand", ring: "border-black/5" },
            { name: "paper", hex: "#fdf6f0", var: "--color-canvas", ring: "border-black/10" },
            { name: "sage", hex: "#597358", var: "--color-accent", ring: "border-black/5" },
            { name: "ink", hex: "#1a0f14", var: "--color-ink", ring: "border-white/10" },
          ].map((s) => (
            <div key={s.name} className="flex items-center gap-3 rounded-xl border border-[var(--rt-outline-variant)]/12 bg-[var(--color-surface)] p-3 shadow-sm">
              <span className={`size-9 shrink-0 rounded-full border shadow-sm ${s.ring}`} style={{ background: s.hex }} />
              <span className="min-w-0 grid">
                <strong className="truncate text-xs font-semibold capitalize text-[var(--color-ink)]">{s.name}</strong>
                <span className="truncate font-mono text-[11px] text-[var(--color-ink-muted)]">{s.var}</span>
              </span>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-ink-muted)]">
          Tip: also try adding a product on <Link href="/en/cairo/shop" className="underline underline-offset-4 hover:text-[var(--color-ink)]">/shop</Link> or toggling the heart on a card — the same floral toasts appear.
        </p>
      </div>
    </main>
  )
}
