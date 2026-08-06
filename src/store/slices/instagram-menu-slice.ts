import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type {
  InstagramAccountSummary,
  InstagramDmMenu,
  InstagramMenuItem,
} from "@/lib/instagram/automations";

// Server state for the Instagram DM menu, modelled on telegram-menu-slice. The
// editor's own draft — the rows being typed before they are saved — stays in
// useState, because until the owner presses save it is not server state at all.

type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export type InstagramMenuRequestError = {
  message: string;
  setupRequired?: boolean;
};

type InstagramMenuState = {
  menu: InstagramDmMenu;
  account: InstagramAccountSummary | null;
  status: LoadStatus;
  error: string | null;
  setupRequired: boolean;
};

type LoadResponse = {
  account: InstagramAccountSummary | null;
  menu: InstagramDmMenu | null;
};

/** Whether Meta accepted the push, which is separate from whether we saved. */
type SaveResponse = { menu: InstagramDmMenu; synced: boolean };

export const EMPTY_INSTAGRAM_MENU: InstagramDmMenu = {
  iceBreakersEnabled: false,
  persistentMenuEnabled: false,
  items: [],
};

const initialState: InstagramMenuState = {
  menu: EMPTY_INSTAGRAM_MENU,
  account: null,
  status: "idle",
  error: null,
  setupRequired: false,
};

const NETWORK_ERROR: InstagramMenuRequestError = {
  message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید و دوباره تلاش کنید.",
};

const responseError = async (
  response: Response
): Promise<InstagramMenuRequestError> => {
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

export const loadInstagramMenu = createAsyncThunk<
  LoadResponse,
  void,
  { rejectValue: InstagramMenuRequestError }
>("instagramMenu/load", async (_, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/instagram/dm-menu", {
      cache: "no-store",
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as LoadResponse;
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

export const saveInstagramMenu = createAsyncThunk<
  SaveResponse,
  {
    iceBreakersEnabled: boolean;
    persistentMenuEnabled: boolean;
    items: Pick<InstagramMenuItem, "kind" | "title" | "replyText">[];
  },
  { rejectValue: InstagramMenuRequestError }
>("instagramMenu/save", async (menu, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/instagram/dm-menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(menu),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as SaveResponse;
  } catch {
    return rejectWithValue(NETWORK_ERROR);
  }
});

const instagramMenuSlice = createSlice({
  name: "instagramMenu",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadInstagramMenu.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.setupRequired = false;
      })
      .addCase(loadInstagramMenu.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.account = action.payload.account;
        state.menu = action.payload.menu ?? EMPTY_INSTAGRAM_MENU;
      })
      .addCase(loadInstagramMenu.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.message ?? "منوی دایرکت بارگذاری نشد.";
        state.setupRequired = action.payload?.setupRequired ?? false;
      })
      .addCase(saveInstagramMenu.fulfilled, (state, action) => {
        state.menu = action.payload.menu;
      });
  },
});

export default instagramMenuSlice.reducer;
