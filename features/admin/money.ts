export function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}
