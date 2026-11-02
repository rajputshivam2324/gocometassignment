import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
} from "react";

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(
      "Unable to connect to the API. Check that the backend is running and try again.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item: { msg?: string }) => item.msg || "Invalid value")
              .join(". ")
          : `Request failed (${response.status}). Please try again.`;
    throw new Error(message);
  }
  return body as T;
}

export function usePolling<T>(path: string) {
  const [data, updateData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Each path owns its requests and callbacks, including callbacks retained by
  // an in-flight mutation after navigation.
  const session = useMemo(
    () => ({ active: false, controller: null as AbortController | null }),
    [path],
  );

  const fetchData = useCallback(
    async (replace: boolean) => {
      if (!session.active || (!replace && session.controller)) return;
      session.controller?.abort();
      const controller = new AbortController();
      session.controller = controller;
      const isCurrent = () =>
        session.active &&
        session.controller === controller &&
        !controller.signal.aborted;
      try {
        const result = await request<T>(path, { signal: controller.signal });
        if (!isCurrent()) return;
        updateData(result);
        setError(null);
        setUpdatedAt(new Date());
      } catch (reason) {
        if (isCurrent())
          setError(
            reason instanceof Error ? reason.message : "Something went wrong.",
          );
      } finally {
        if (isCurrent()) {
          session.controller = null;
          setLoading(false);
        }
      }
    },
    [path, session],
  );

  // Explicit retries supersede older reads. Timer/visibility polls below wait
  // for the current read instead, so a slow API can still finish.
  const refresh = useCallback(() => fetchData(true), [fetchData]);

  const setData = useCallback(
    (value: SetStateAction<T | null>) => {
      if (!session.active) return;
      // A committed mutation is newer than any read started before it.
      session.controller?.abort();
      session.controller = null;
      updateData(value);
      setError(null);
      setLoading(false);
      setUpdatedAt(new Date());
    },
    [session],
  );

  useEffect(() => {
    session.active = true;
    updateData(null);
    setLoading(true);
    setError(null);
    setUpdatedAt(null);
    void fetchData(false);
    const interval = window.setInterval(() => {
      if (!document.hidden) void fetchData(false);
    }, 5000);
    const onVisible = () => {
      if (!document.hidden) void fetchData(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      session.active = false;
      session.controller?.abort();
      session.controller = null;
    };
  }, [fetchData, session]);

  return { data, setData, loading, error, updatedAt, refresh };
}
