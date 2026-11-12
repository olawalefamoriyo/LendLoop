"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "./format";

/**
 * Runs an async action while tracking `pending` and a friendly `error`.
 * `run` resolves to true on success so callers can close dialogs etc.
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, run };
}
