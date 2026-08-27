"use client";

import { MotionConfig } from "motion/react";
import { MotionPrefsProvider, useMotionPrefs } from "@/lib/motion/MotionPrefsContext";
import { durations, easings } from "@/lib/motion/tokens";

function MotionConfigInner({ children }: { children: React.ReactNode }) {
  const { reduceMotion } = useMotionPrefs();
  return (
    <MotionConfig
      reducedMotion={reduceMotion ? "always" : "user"}
      transition={{ duration: durations.normal / 1000, ease: easings.standard }}
    >
      {children}
    </MotionConfig>
  );
}

export function MotionProvider({
  children,
  initialReduceMotion,
}: {
  children: React.ReactNode;
  initialReduceMotion?: boolean;
}) {
  return (
    <MotionPrefsProvider initialReduceMotion={initialReduceMotion}>
      <div data-motion-root style={{ minHeight: "100%" }}>
        <MotionConfigInner>{children}</MotionConfigInner>
      </div>
    </MotionPrefsProvider>
  );
}
