import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { AutomationBot, KeywordAutomation } from "@/lib/automations";

type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export type AutomationRequestError = {
  message: string;
  setupRequired?: boolean;
};

type AutomationsState = {
  items: KeywordAutomation[];
  bot: AutomationBot | null;
  status: LoadStatus;
  error: string | null;
  setupRequired: boolean;
};

type LoadResponse = {
  automations: KeywordAutomation[];
  bot: AutomationBot | null;
};

type MutationResponse = {
  automation: KeywordAutomation;
  webhookActive: boolean;
  commandsSynced: boolean;
};

type DeleteResponse = {
  id: string;
  commandsSynced: boolean;
};

const initialState: AutomationsState = {
  items: [],
  bot: null,
  status: "idle",
  error: null,
  setupRequired: false,
};

const responseError = async (response: Response): Promise<AutomationRequestError> => {
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

export const loadAutomations = createAsyncThunk<
  LoadResponse,
  void,
  { rejectValue: AutomationRequestError }
>("automations/load", async (_, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/automations", { cache: "no-store" });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as LoadResponse;
  } catch {
    return rejectWithValue({
      message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.",
    });
  }
});

export const createAutomation = createAsyncThunk<
  MutationResponse,
  {
    triggerType: KeywordAutomation["triggerType"];
    keyword: string;
    commandDescription: string | null;
    replyText: string;
  },
  { rejectValue: AutomationRequestError }
>("automations/create", async (input, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as MutationResponse;
  } catch {
    return rejectWithValue({
      message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.",
    });
  }
});

export const updateAutomation = createAsyncThunk<
  MutationResponse,
  {
    id: string;
    changes: {
      triggerType?: KeywordAutomation["triggerType"];
      keyword?: string;
      commandDescription?: string | null;
      replyText?: string;
      isActive?: boolean;
    };
  },
  { rejectValue: AutomationRequestError }
>("automations/update", async ({ id, changes }, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as MutationResponse;
  } catch {
    return rejectWithValue({
      message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.",
    });
  }
});

export const deleteAutomation = createAsyncThunk<
  DeleteResponse,
  string,
  { rejectValue: AutomationRequestError }
>("automations/delete", async (id, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/automations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    const data = (await response.json()) as { commandsSynced?: boolean };
    return { id, commandsSynced: data.commandsSynced === true };
  } catch {
    return rejectWithValue({
      message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.",
    });
  }
});

const automationsSlice = createSlice({
  name: "automations",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadAutomations.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.setupRequired = false;
      })
      .addCase(loadAutomations.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload.automations;
        state.bot = action.payload.bot;
      })
      .addCase(loadAutomations.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.message ?? "اتوماسیون‌ها بارگذاری نشدند.";
        state.setupRequired = action.payload?.setupRequired ?? false;
      })
      .addCase(createAutomation.fulfilled, (state, action) => {
        state.items.unshift(action.payload.automation);
      })
      .addCase(updateAutomation.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.automation.id
        );
        if (index >= 0) state.items[index] = action.payload.automation;
      })
      .addCase(deleteAutomation.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload.id);
      });
  },
});

export default automationsSlice.reducer;
