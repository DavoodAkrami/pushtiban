import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { AutomationFlow, AutomationFlowDetail } from "@/lib/flows";

type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export type FlowRequestError = { message: string; setupRequired?: boolean };

type FlowsState = {
  items: AutomationFlow[];
  status: LoadStatus;
  error: string | null;
  setupRequired: boolean;
};

type FlowMutationResponse = {
  flow: AutomationFlow;
  webhookActive: boolean;
  commandsSynced: boolean;
};

type FlowDetailResponse = { flow: AutomationFlowDetail };

const initialState: FlowsState = {
  items: [],
  status: "idle",
  error: null,
  setupRequired: false,
};

const responseError = async (response: Response): Promise<FlowRequestError> => {
  try {
    const data = (await response.json()) as { error?: string; setupRequired?: boolean };
    return { message: data.error ?? "درخواست انجام نشد؛ دوباره تلاش کنید.", setupRequired: data.setupRequired };
  } catch {
    return { message: "درخواست انجام نشد؛ دوباره تلاش کنید." };
  }
};

export const loadFlows = createAsyncThunk<
  { flows: AutomationFlow[] },
  void,
  { rejectValue: FlowRequestError }
>("flows/load", async (_, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/flows", { cache: "no-store" });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as { flows: AutomationFlow[] };
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

export const loadFlowDetail = createAsyncThunk<
  FlowDetailResponse,
  string,
  { rejectValue: FlowRequestError }
>("flows/loadDetail", async (id, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/flows/${id}`, { cache: "no-store" });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as FlowDetailResponse;
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

export const createFlow = createAsyncThunk<
  FlowMutationResponse,
  { triggerType: "keyword" | "command"; triggerKeyword: string; name: string; commandDescription?: string; rootMessage: string },
  { rejectValue: FlowRequestError }
>("flows/create", async (input, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as FlowMutationResponse;
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

export const updateFlow = createAsyncThunk<
  FlowMutationResponse & { nodes?: unknown },
  { id: string; changes: Record<string, unknown> },
  { rejectValue: FlowRequestError }
>("flows/update", async ({ id, changes }, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/flows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as FlowMutationResponse;
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

export const deleteFlow = createAsyncThunk<
  { id: string; commandsSynced: boolean },
  string,
  { rejectValue: FlowRequestError }
>("flows/delete", async (id, { rejectWithValue }) => {
  try {
    const response = await fetch(`/api/flows/${id}`, { method: "DELETE" });
    if (!response.ok) return rejectWithValue(await responseError(response));
    const data = (await response.json()) as { commandsSynced?: boolean };
    return { id, commandsSynced: data.commandsSynced === true };
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

const flowsSlice = createSlice({
  name: "flows",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadFlows.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.setupRequired = false;
      })
      .addCase(loadFlows.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload.flows;
      })
      .addCase(loadFlows.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.message ?? "فلوها بارگذاری نشدند.";
        state.setupRequired = action.payload?.setupRequired ?? false;
      })
      .addCase(createFlow.fulfilled, (state, action) => {
        state.items.unshift(action.payload.flow);
      })
      .addCase(updateFlow.fulfilled, (state, action) => {
        const idx = state.items.findIndex((f) => f.id === action.payload.flow.id);
        if (idx >= 0) state.items[idx] = action.payload.flow;
      })
      .addCase(deleteFlow.fulfilled, (state, action) => {
        state.items = state.items.filter((f) => f.id !== action.payload.id);
      });
  },
});

export default flowsSlice.reducer;
