"use client";

import { useCallback, useRef, useState } from "react";

export function useCancelableTask() {
  const controllerRef = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setProgress(null);
  }, []);

  const start = useCallback(
    async <T,>(
      fn: (ctx: {
        signal: AbortSignal;
        reportProgress: (value: number | null) => void;
      }) => Promise<T>,
    ) => {
      if (isRunning) return null;

      const controller = new AbortController();
      controllerRef.current = controller;
      setIsRunning(true);
      setProgress(null);

      try {
        const result = await fn({
          signal: controller.signal,
          reportProgress: setProgress,
        });
        return result;
      } catch (e) {
        if (controller.signal.aborted) return null;
        throw e;
      } finally {
        controllerRef.current = null;
        setIsRunning(false);
      }
    },
    [isRunning],
  );

  return { start, cancel, reset, isRunning, progress };
}
