"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MotionPrefs = {
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
};

const MotionPrefsContext = createContext<MotionPrefs | null>(null);

type MotionPrefsProviderProps = {
  children: ReactNode;
  initialReduceMotion?: boolean;
};

export function MotionPrefsProvider({
  children,
  initialReduceMotion,
}: MotionPrefsProviderProps) {
  const [reduceMotion, setReduceMotion] = useState(initialReduceMotion ?? false);
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
