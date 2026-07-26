import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * The signed-in business's own AI usage against its monthly caps, as reported
 * by /api/usage/me. Server-side state: read by the sidebar quota indicator and
 * the dashboard overview. UI state does NOT belong here.
 */
export type BusinessUsage = {
  monthPromptTokens: number;
  monthCompletionTokens: number;
  monthTokens: number;
  monthMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalMessages: number;
  /** null = unlimited. */
  monthlyTokenLimit: number | null;
  monthlyMessageLimit: number | null;
  aiBlocked: boolean;
  /** Messages left this month, or null when there is no message cap. */
  messagesLeft: number | null;
};

type UsageState = {
  /** null = failed or unavailable, undefined = not resolved yet */
  usage: BusinessUsage | null | undefined;
};

const initialState: UsageState = {
  usage: undefined,
};

const usageSlice = createSlice({
  name: "usage",
  initialState,
  reducers: {
    setUsage(state, action: PayloadAction<BusinessUsage | null>) {
      state.usage = action.payload;
    },
  },
});

export const { setUsage } = usageSlice.actions;
export default usageSlice.reducer;
