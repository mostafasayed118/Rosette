"use client";

import { AnimatePresence, motion } from "motion/react";
import { durations, easings } from "@/lib/motion/tokens";

type PageTransitionProps = {
  routeKey: string;
  children: React.ReactNode;
};

export function PageTransition({ routeKey, children }: PageTransitionProps) {
  return (
    <AnimatePresence>
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: durations.normal / 1000, ease: easings.standard }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

