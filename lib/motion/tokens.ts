export const durations = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

export const easings = {
  standard: [0.4, 0, 0.2, 1],
  emphasized: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const springs = {
  gentle: { type: "spring", stiffness: 120, damping: 20 },
  snappy: { type: "spring", stiffness: 400, damping: 30 },
} as const;

export type Durations = typeof durations;
export type Easings = typeof easings;
export type Springs = typeof springs;
