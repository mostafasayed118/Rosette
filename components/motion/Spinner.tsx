import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "size-3",
  md: "size-4",
  lg: "size-6",
  xl: "size-8",
} as const;

type SpinnerProps = {
  size?: keyof typeof sizeMap;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>;

export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      {...props}
      className={cn("inline-flex", sizeMap[size], className)}
    >
      <Loader2Icon className="animate-spin w-full h-full" aria-hidden="true" />
    </span>
  );
}