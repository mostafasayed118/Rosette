"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { Slot } from "radix-ui";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "./Spinner";

type AnimatedButtonProps = Omit<HTMLMotionProps<"button">, "children"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    success?: boolean;
    error?: boolean;
    loadingText?: string;
    children?: React.ReactNode;
  };

export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      success = false,
      error = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isLoading = loading;
    const showSuccess = !isLoading && success;
    const showError = !isLoading && !showSuccess && error;

    const classes = cn(
      buttonVariants({ variant, size }),
      "relative overflow-hidden",
      showSuccess && "bg-green-600 text-white hover:bg-green-600",
      showError && "bg-destructive text-white",
      className
    );

    const inner = (
      <>
        {isLoading && <Spinner size="sm" className="shrink-0" />}
        <span className={cn("transition-opacity", isLoading && "opacity-70")}>
          {isLoading && loadingText ? loadingText : children}
        </span>
      </>
    );

    if (asChild) {
      const childElement = children as React.ReactElement<{ children?: React.ReactNode }>;
      if (isLoading) {
        return (
          <Slot.Root ref={ref as React.Ref<HTMLElement>} className={classes} {...(props as Record<string, unknown>)}>
            {React.cloneElement(
              childElement,
              {},
              <>
                <Spinner size="sm" className="shrink-0" />
                <span className={cn("transition-opacity", "opacity-70")}>
                  {loadingText ? loadingText : childElement.props.children}
                </span>
              </>
            )}
          </Slot.Root>
        );
      }
      return (
        <Slot.Root ref={ref as React.Ref<HTMLElement>} className={classes} {...(props as Record<string, unknown>)}>
          {childElement}
        </Slot.Root>
      );
    }

    return (
      <motion.button
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        data-loading={isLoading || undefined}
        data-success={showSuccess || undefined}
        data-error={showError || undefined}
        className={classes}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        whileHover={!isLoading ? { scale: 1.02 } : undefined}
        whileTap={!isLoading ? { scale: 0.97 } : undefined}
        whileFocus={!isLoading ? { scale: 1.01 } : undefined}
        animate={
          showError
            ? { x: [-8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4 } }
            : showSuccess
              ? { scale: [1, 1.05, 1], transition: { duration: 0.35 } }
              : undefined
        }
        {...props}
      >
        {inner}
      </motion.button>
    );
  }
);

AnimatedButton.displayName = "AnimatedButton";
