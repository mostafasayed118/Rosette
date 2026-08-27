import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

type SpinnerOverlayProps = {
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function SpinnerOverlay({ children, className, ...props }: SpinnerOverlayProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      <Spinner size="lg" />
      {children}
    </div>
  );
}
