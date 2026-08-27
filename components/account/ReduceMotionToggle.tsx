"use client";

import { useTransition } from "react";
import { useMotionPrefs } from "@/lib/motion/MotionPrefsContext";
import { setReduceMotionPref } from "@/features/account/preferences/actions";

type Props = {
  initialValue?: boolean;
};

export function ReduceMotionToggle({ initialValue }: Props) {
  const { reduceMotion, setReduceMotion } = useMotionPrefs();
  const [pending, startTransition] = useTransition();
  const checked = initialValue !== undefined ? initialValue : reduceMotion;

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        role="checkbox"
        aria-label="Reduce motion"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setReduceMotion(next);
          startTransition(async () => {
            await setReduceMotionPref(next);
          });
        }}
      />
      <label className="text-sm">Reduce motion (overrides OS preference)</label>
    </div>
  );
}
