import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Server-side session state — who is signed in, as reported by Supabase.
 * UI state (toggles, forms, hover…) does NOT belong here; use useState.
 */
export type SessionProfile = {
  name: string;
  email: string;
};

type SessionState = {
  /** null = signed out, undefined = not resolved yet */
  profile: SessionProfile | null | undefined;
};

const initialState: SessionState = {
  profile: undefined,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setProfile(state, action: PayloadAction<SessionProfile | null>) {
      state.profile = action.payload;
    },
    clearProfile(state) {
      state.profile = null;
    },
  },
});

export const { setProfile, clearProfile } = sessionSlice.actions;
export default sessionSlice.reducer;
