"use client";

import * as React from "react";

/**
 * Lets a page whose title is data, not a route constant, tell the top bar what
 * it is showing. Pages with a static title need nothing — the bar resolves
 * those from the route manifest in lib/dashboard/navigation.
 *
 * Its own module rather than part of the shell so a page can subscribe without
 * importing the whole dashboard chrome.
 */
export const DashboardTitleContext = React.createContext<
  ((title: string | null) => void) | null
>(null);

/** Publish a dynamic title for as long as the calling component is mounted. */
export const useDashboardTitle = (title: string | null) => {
  const setTitle = React.useContext(DashboardTitleContext);

  React.useEffect(() => {
    setTitle?.(title);
    return () => setTitle?.(null);
  }, [setTitle, title]);
};
