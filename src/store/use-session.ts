"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useAppDispatch, useAppSelector } from "./hooks";
import { setProfile, type SessionProfile } from "./slices/session-slice";

const toProfile = (user: User | null | undefined): SessionProfile | null =>
  user
    ? {
        name: (user.user_metadata?.full_name as string) ?? "",
        email: user.email ?? "",
      }
    : null;

/**
 * Syncs the Supabase session into the Redux store and returns the profile.
 * undefined = not resolved yet, null = signed out.
 * Reads the local cookie session (no network hop) and stays subscribed to
 * auth changes, so login/logout updates every consumer at once.
 */
export const useSessionProfile = () => {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.session.profile);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => dispatch(setProfile(toProfile(data.session?.user))));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      dispatch(setProfile(toProfile(session?.user)))
    );
    return () => subscription.unsubscribe();
  }, [dispatch]);

  return profile;
};
