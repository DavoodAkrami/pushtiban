"use client";

import * as React from "react";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setOpenCount } from "./slices/inbox-slice";

// Shared across consumers so the top bar badge and anything else that wants the
// number issue one request, not two — same arrangement as use-usage.
let inFlight: Promise<number | null> | null = null;

const fetchOpenCount = (): Promise<number | null> => {
  inFlight ??= fetch("/api/inbox/count")
    .then((res) => (res.ok ? (res.json() as Promise<{ count?: number | null }>) : null))
    .then((body) => body?.count ?? null)
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

/**
 * Number of open support conversations, synced into the Redux store.
 * undefined = not resolved yet, null = unavailable (or the inbox schema is not
 * set up). Call `refresh()` after answering or closing a conversation.
 */
export const useInboxCount = () => {
  const dispatch = useAppDispatch();
  const openCount = useAppSelector((state) => state.inbox.openCount);
  const requested = React.useRef(false);

  const refresh = React.useCallback(async () => {
    dispatch(setOpenCount(await fetchOpenCount()));
  }, [dispatch]);

  React.useEffect(() => {
    if (requested.current || openCount !== undefined) return;
    requested.current = true;
    void refresh();
  }, [refresh, openCount]);

  return { openCount, refresh };
};
