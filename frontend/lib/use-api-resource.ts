"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export interface ApiResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * GET one JSON resource for the lifetime of a component.
 *
 * For rail panels whose payload no other surface reads, so it has no business
 * in the shared store. A response for a superseded `path` is dropped, so
 * switching proteins quickly can never show the previous protein's data.
 * `path === null` means "nothing to fetch yet".
 */
export function useApiResource<T>(path: string | null): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    apiGet<T>(path)
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, loading, error, reload };
}
