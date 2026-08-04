import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type {
  InstagramAccountSummary,
  InstagramAutomation,
  InstagramMatchType,
  InstagramTriggerType,
} from "@/lib/instagram/automations";

// Server state for the Instagram rule panels, modelled on automations-slice.
// The editor modal's own state (open, draft fields, validation) stays in
// useState — this holds only what came from the server.

type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export type InstagramRequestError = {
  message: string;
  setupRequired?: boolean;
};

/** Which slice of the rules a panel asked for. */
export type InstagramRuleScope = "comment" | "dm_keyword" | "story" | "all";

type InstagramAutomationsState = {
  items: InstagramAutomation[];
  account: InstagramAccountSummary | null;
  status: LoadStatus;
  error: string | null;
  setupRequired: boolean;
  /** The scope the loaded items belong to, so a panel can tell stale from empty. */
  scope: InstagramRuleScope | null;
};

type LoadResponse = {
  automations: InstagramAutomation[];
  account: InstagramAccountSummary | null;
};

type MutationResponse = {
  automation: InstagramAutomation;
  webhookActive: boolean;
};

export type InstagramAutomationDraft = {
  triggerType: InstagramTriggerType;
  phrase: string | null;
  matchType: InstagramMatchType;
  mediaId: string | null;
  replyText: string;
  publicReplyText: string | null;
};

const initialState: InstagramAutomationsState = {
  items: [],
  account: null,
  status: "idle",
  error: null,
  setupRequired: false,
  scope: null,
};

const NETWORK_ERROR: InstagramRequestError = {
  message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.",
};

const responseError = async (
  response: Response
): Promise<InstagramRequestError> => {
  try {
    const data = (await response.json()) as {
      error?: string;
      setupRequired?: boolean;
    };
    return {
      message: data.error ?? "درخواست انجام نشد؛ دوباره تلاش کنید.",
      setupRequired: data.setupRequired,
    };
  } catch {
    return { message: "درخواست انجام نشد؛ دوباره تلاش کنید." };
  }
};

export const loadInstagramAutomations = createAsyncThunk<
  LoadResponse & { scope: InstagramRuleScope },
  InstagramRuleScope,
  { rejectValue: InstagramRequestError }
>("instagramAutomations/load", async (scope, { rejectWithValue }) => {
  try {
    const query = scope === "all" ? "" : `?trigger=${scope}`;
    const response = await fetch(`/api/instagram/automations${query}`, {
      cache: "no-store",
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    const data = (await response.json()) as LoadResponse;
    return { ...data, scope };
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const createInstagramAutomation = createAsyncThunk<
  MutationResponse,
  InstagramAutomationDraft,
  { rejectValue: InstagramRequestError }
>("instagramAutomations/create", async (input, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/instagram/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as MutationResponse;
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const updateInstagramAutomation = createAsyncThunk<
  MutationResponse,
  { id: string; changes: Partial<InstagramAutomationDraft> & { isActive?: boolean } },
  { rejectValue: InstagramRequestError }
>(
  "instagramAutomations/update",
  async ({ id, changes }, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/instagram/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) return rejectWithValue(await responseError(response));
      return (await response.json()) as MutationResponse;
    } catch {
      return rejectWithValue(NETWORK_ERROR);
    }
  }
);

export const deleteInstagramAutomation = createAsyncThunk<
  { id: string },
  string,
  { rejectValue: InstagramRequestError }
>("instagramAutomations/delete", async (id, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/instagram/automations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return { id };
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

const instagramAutomationsSlice = createSlice({
  name: "instagramAutomations",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadInstagramAutomations.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.setupRequired = false;
      })
      .addCase(loadInstagramAutomations.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload.automations;
        state.account = action.payload.account;
        state.scope = action.payload.scope;
      })
      .addCase(loadInstagramAutomations.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.message ?? "اتوماسیون‌ها بارگذاری نشدند.";
        state.setupRequired = action.payload?.setupRequired ?? false;
      })
      .addCase(createInstagramAutomation.fulfilled, (state, action) => {
        state.items.unshift(action.payload.automation);
      })
      .addCase(updateInstagramAutomation.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.automation.id
        );
        if (index >= 0) state.items[index] = action.payload.automation;
      })
      .addCase(deleteInstagramAutomation.fulfilled, (state, action) => {
        state.items = state.items.filter(
          (item) => item.id !== action.payload.id
        );
      });
  },
});

export default instagramAutomationsSlice.reducer;
