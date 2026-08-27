"use client";

import { useState, useTransition } from "react";
import { useMotionPrefs } from "@/lib/motion/MotionPrefsContext";
import { setReduceMotionPref } from "@/features/account/preferences/actions";

type Props = {
  initialValue?: boolean;
};

export function ReduceMotionToggle({ initialValue }: Props) {
  const { reduceMotion, setReduceMotion } = useMotionPrefs();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? initialValue ?? reduceMotion;

  return (
    <div className="flex items-center gap-2">
      <input
        id="reduce-motion-toggle"
        type="checkbox"
        aria-label="Reduce motion"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOptimistic(next);
          setReduceMotion(next);
          document.cookie = `rosette-reduce-motion=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
          startTransition(async () => {
            await setReduceMotionPref(next);
          });
        }}
      />
      <label htmlFor="reduce-motion-toggle" className="text-sm">
        Reduce motion (overrides OS preference)
      </label>
    </div>
  );
}
