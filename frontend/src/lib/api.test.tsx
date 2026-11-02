// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "./api";

interface PendingRequest {
  path: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
}

describe("usePolling", () => {
  let pending: PendingRequest[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    pending = [];
    // Deliberately allow aborted requests to resolve: cancellation alone must
    // not be relied on to keep obsolete responses out of state.
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      new Promise<Response>((resolve) => {
        pending.push({ path, signal: options.signal as AbortSignal, resolve });
      }),
    ));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function respond(index: number, value: string, status = 200) {
    await act(async () => {
      pending[index].resolve(new Response(
        JSON.stringify(status === 200 ? { value } : { detail: value }),
        { status, headers: { "Content-Type": "application/json" } },
      ));
    });
  }

  it("lets a read slower than the polling interval finish and continues polling", async () => {
    const { result } = renderHook(() => usePolling<{ value: string }>("/auctions"));

    act(() => {
      vi.advanceTimersByTime(6200);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].signal.aborted).toBe(false);
    expect(result.current.loading).toBe(true);

    await respond(0, "slow result");
    expect(result.current.data).toEqual({ value: "slow result" });
    expect(result.current.loading).toBe(false);
    expect(result.current.updatedAt).toBeInstanceOf(Date);

    act(() => vi.advanceTimersByTime(3800));
    expect(pending).toHaveLength(2);
    await respond(1, "next result");
    expect(result.current.data).toEqual({ value: "next result" });
  });

  it("keeps an explicit refresh when an older response arrives out of order", async () => {
    const { result } = renderHook(() => usePolling<{ value: string }>("/auctions"));
    act(() => { void result.current.refresh(); });
    expect(pending[0].signal.aborted).toBe(true);
    await respond(1, "fresh");
    const updatedAt = result.current.updatedAt;

    await respond(0, "obsolete");
    expect(result.current.data).toEqual({ value: "fresh" });
    expect(result.current.updatedAt).toBe(updatedAt);
    expect(result.current.loading).toBe(false);
  });

  it("ignores an obsolete request's error after a successful refresh", async () => {
    const { result } = renderHook(() => usePolling<{ value: string }>("/auctions"));
    act(() => { void result.current.refresh(); });
    await respond(1, "fresh");
    await respond(0, "obsolete error", 500);
    expect(result.current.data).toEqual({ value: "fresh" });
    expect(result.current.error).toBeNull();
  });

  it("invalidates reads when a successful mutation commits data", async () => {
    const { result } = renderHook(() => usePolling<{ value: string }>("/auctions/one"));
    await respond(0, "initial");
    act(() => vi.advanceTimersByTime(5000));
    act(() => result.current.setData({ value: "submitted quote" }));
    expect(pending[1].signal.aborted).toBe(true);
    act(() => { void result.current.refresh(); });

    await respond(1, "snapshot before submission");
    expect(result.current.data).toEqual({ value: "submitted quote" });
    await respond(2, "snapshot after submission");
    expect(result.current.data).toEqual({ value: "snapshot after submission" });
  });

  it("isolates routes, including callbacks retained by old mutations", async () => {
    const { result, rerender } = renderHook(
      ({ path }) => usePolling<{ value: string }>(path),
      { initialProps: { path: "/auctions/one" } },
    );
    const oldSetData = result.current.setData;
    const oldRefresh = result.current.refresh;
    rerender({ path: "/auctions/two" });
    expect(pending[0].signal.aborted).toBe(true);
    await respond(1, "second auction");
    rerender({ path: "/auctions/one" });
    expect(result.current.updatedAt).toBeNull();
    expect(result.current.loading).toBe(true);
    act(() => {
      oldSetData({ value: "old mutation" });
      void oldRefresh();
    });
    expect(pending.map((request) => request.path)).toEqual([
      "/api/auctions/one", "/api/auctions/two", "/api/auctions/one",
    ]);
    await respond(0, "old first auction");
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await respond(2, "current first auction");
    expect(result.current.data).toEqual({ value: "current first auction" });
  });

  it("aborts and removes polling on unmount", async () => {
    const { result, unmount } = renderHook(() => usePolling("/auctions"));
    const refresh = result.current.refresh;
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await refresh();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(pending).toHaveLength(1);
    await respond(0, "late response");
  });

  it("survives StrictMode's effect cleanup and restart", async () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => usePolling<{ value: string }>("/auctions"), { wrapper });
    expect(pending).toHaveLength(2);
    expect(pending[0].signal.aborted).toBe(true);
    await respond(1, "current");
    await respond(0, "aborted setup");
    expect(result.current.data).toEqual({ value: "current" });
    expect(result.current.loading).toBe(false);
  });
});
