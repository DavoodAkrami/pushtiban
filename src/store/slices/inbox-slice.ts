import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * How many support conversations are still open, as reported by
 * /api/inbox/count. Server-side state: read by the top bar's inbox badge so a
 * waiting customer is visible from anywhere in the dashboard.
 */
type InboxState = {
  /** null = unavailable (or the inbox schema is not set up), undefined = not resolved yet. */
  openCount: number | null | undefined;
};

const initialState: InboxState = {
  openCount: undefined,
};

const inboxSlice = createSlice({
  name: "inbox",
  initialState,
  reducers: {
    setOpenCount(state, action: PayloadAction<number | null>) {
      state.openCount = action.payload;
    },
  },
});

export const { setOpenCount } = inboxSlice.actions;
export default inboxSlice.reducer;
