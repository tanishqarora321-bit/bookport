"use client";

// Faster module switching (owner, 2026-11): a sidebar module's page is
// fetched IN FULL (data included) the moment the pointer rests on its link
// (or a finger touches it), so by the time the click lands the page is
// usually already here and opens instantly.
//
// Freshness guard: a page prefetched BEFORE something was saved could show
// data from before that save. Every successful POST/PATCH/PUT/DELETE to
// /api is recorded here; clicking a link whose prefetch is older than the
// last save throws the prefetched copy away (router.refresh() clears the
// router cache) and loads it fresh. Prefetched pages also expire after 30s
// (next.config.js experimental.staleTimes.static).

const prefetchedAt = new Map<string, number>();
let lastMutationAt = 0;
let installed = false;

export function installMutationTracker() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await orig(input, init);
    try {
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (method !== "GET" && method !== "HEAD" && res.ok && /(^|\/\/[^/]+)\/api\//.test(url)) lastMutationAt = Date.now();
    } catch {
      /* never break a request over bookkeeping */
    }
    return res;
  };
}

type Router = { prefetch: (href: string, opts?: any) => void; refresh: () => void };

export function prefetchFull(router: Router, href: string) {
  const at = prefetchedAt.get(href);
  const now = Date.now();
  if (at !== undefined) {
    // A copy predating a save stays marked stale: the router would just keep
    // its cached copy anyway, so the click (needsFreshLoad) reloads it.
    if (at <= lastMutationAt) return;
    // Still fresh - nothing to do. Older than the router's 30s window: refetch.
    if (now - at < 25_000) return;
  }
  prefetchedAt.set(href, now);
  router.prefetch(href, { kind: "full" });
}

/** Call on click: true when the prefetched copy must be dropped first. */
export function needsFreshLoad(href: string) {
  const at = prefetchedAt.get(href);
  return at !== undefined && at <= lastMutationAt;
}

export function forgetPrefetches() {
  prefetchedAt.clear();
}
