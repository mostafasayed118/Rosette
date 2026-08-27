"use client";

import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MotionCardProps = React.ComponentProps<typeof Card>;

export function MotionCard({ className, ...props }: MotionCardProps) {
  const { "data-testid": dataTestId, ...cardProps } = props as Record<string, unknown> & typeof props;
  return (
    <motion.div
      data-testid={dataTestId as string | undefined}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("will-change-transform", className)}
    >
      <Card {...(cardProps as typeof props)} />
    </motion.div>
  );
}
