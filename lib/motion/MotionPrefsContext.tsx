"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MotionPrefs = {
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
};

const MotionPrefsContext = createContext<MotionPrefs | null>(null);

export function MotionPrefsProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  return (
    <MotionPrefsContext.Provider value={{ reduceMotion, setReduceMotion }}>
      {children}
    </MotionPrefsContext.Provider>
  );
}

export function useMotionPrefs(): MotionPrefs {
  const ctx = useContext(MotionPrefsContext);
  if (!ctx) throw new Error("useMotionPrefs must be used within MotionPrefsProvider");
  return ctx;
}
