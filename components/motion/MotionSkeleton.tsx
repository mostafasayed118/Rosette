import { cn } from "@/lib/utils";

type MotionSkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function MotionSkeleton({ className, ...props }: MotionSkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}