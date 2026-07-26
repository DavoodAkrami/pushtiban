"use client";

import * as React from "react";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setUsage, type BusinessUsage } from "./slices/usage-slice";

// Shared across consumers so the sidebar and the page that mounts alongside it
// issue one request, not two.
let inFlight: Promise<BusinessUsage | null> | null = null;

const fetchUsage = (): Promise<BusinessUsage | null> => {
  inFlight ??= fetch("/api/usage/me")
    .then((res) => (res.ok ? (res.json() as Promise<{ usage?: BusinessUsage }>) : null))
    .then((body) => body?.usage ?? null)
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

/**
 * Syncs the signed-in business's own AI usage into the Redux store and returns
 * it. undefined = not resolved yet, null = unavailable.
 *
 * The first consumer to mount fetches; later consumers reuse the stored value,
 * so the sidebar and the overview page share one request. `refresh()` re-reads
 * it after something is known to have changed.
 */
export const useBusinessUsage = () => {
  const dispatch = useAppDispatch();
  const usage = useAppSelector((state) => state.usage.usage);
  const requested = React.useRef(false);

  const refresh = React.useCallback(async () => {
    dispatch(setUsage(await fetchUsage()));
  }, [dispatch]);

  React.useEffect(() => {
    if (requested.current || usage !== undefined) return;
    requested.current = true;
    void refresh();
  }, [refresh, usage]);

  return { usage, refresh };
};
