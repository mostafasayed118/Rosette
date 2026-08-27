import type { Variants } from "motion/react";
import { durations, easings } from "./tokens";

const baseTransition = { duration: durations.normal / 1000, ease: easings.standard };

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: baseTransition },
  exit: { opacity: 0, y: -12, transition: baseTransition },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: baseTransition },
  exit: { opacity: 0, transition: baseTransition },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: baseTransition },
  exit: { opacity: 0, scale: 0.95, transition: baseTransition },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: baseTransition },
  exit: { opacity: 0, x: 24, transition: baseTransition },
};
