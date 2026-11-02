import { useCallback, useEffect, useRef, useState } from "react";

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
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const activeController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    try {
      const result = await request<T>(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(result);
      setError(null);
      setUpdatedAt(new Date());
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "Something went wrong.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setError(null);
    void refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      activeController.current?.abort();
    };
  }, [refresh]);

  return { data, setData, loading, error, updatedAt, refresh };
}
