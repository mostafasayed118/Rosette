"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const SUCCESS_WINDOW_MS = 1500;
const ERROR_WINDOW_MS = 2000;

type Action<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

type UseAsyncActionOptions<TArgs extends unknown[], TResult> = {
  action: Action<TArgs, TResult>;
  successMessage?: string | ((result: TResult) => string);
  errorMessage?: string | ((err: unknown) => string);
  silentSuccess?: boolean;
  silentError?: boolean;
  onSuccess?: (result: TResult) => void;
  onError?: (err: unknown) => void;
  onSettled?: () => void;
};

type UseAsyncActionReturn<TArgs extends unknown[], TResult> = {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown | null;
  reset: () => void;
};

export function useAsyncAction<TArgs extends unknown[], TResult>(
  options: UseAsyncActionOptions<TArgs, TResult>
): UseAsyncActionReturn<TArgs, TResult> {
  const { action, successMessage, errorMessage, silentSuccess, silentError, onSuccess, onError, onSettled } = options;

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  const pendingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const reset = useCallback(() => {
    clearSettleTimer();
    setIsSuccess(false);
    setIsError(false);
    setError(null);
  }, [clearSettleTimer]);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (pendingRef.current) return undefined;
      pendingRef.current = true;
      clearSettleTimer();
      setIsPending(true);
      setIsSuccess(false);
      setIsError(false);
      setError(null);
      try {
        const result = await action(...args);
        if (!silentSuccess && successMessage !== undefined) {
          const msg = typeof successMessage === "function" ? successMessage(result) : successMessage;
          toast.success(msg);
        }
        setIsSuccess(true);
        onSuccess?.(result);
        settleTimerRef.current = setTimeout(() => {
          setIsSuccess(false);
          settleTimerRef.current = null;
          onSettled?.();
        }, SUCCESS_WINDOW_MS);
        return result;
      } catch (err) {
        if (!silentError && errorMessage !== undefined) {
          const msg = typeof errorMessage === "function" ? errorMessage(err) : errorMessage;
          toast.error(msg);
        }
        setIsError(true);
        setError(err);
        onError?.(err);
        settleTimerRef.current = setTimeout(() => {
          setIsError(false);
          settleTimerRef.current = null;
          onSettled?.();
        }, ERROR_WINDOW_MS);
        return undefined;
      } finally {
        setIsPending(false);
        pendingRef.current = false;
      }
    },
    [action, successMessage, errorMessage, silentSuccess, silentError, onSuccess, onError, onSettled, clearSettleTimer]
  );

  return { run, isPending, isSuccess, isError, error, reset };
}
