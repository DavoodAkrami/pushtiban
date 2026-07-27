import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  DEFAULT_TELEGRAM_MENU,
  type MenuTargets,
  type TelegramMenu,
} from "@/lib/telegram-menu";

type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export type MenuRequestError = { message: string; setupRequired?: boolean };

type TelegramMenuState = {
  menu: TelegramMenu;
  targets: MenuTargets;
  connected: boolean;
  status: LoadStatus;
  error: string | null;
  setupRequired: boolean;
};

type MenuResponse = {
  connected: boolean;
  menu: TelegramMenu;
  targets: MenuTargets;
};

const initialState: TelegramMenuState = {
  menu: DEFAULT_TELEGRAM_MENU,
  targets: { flows: [], replies: [] },
  connected: false,
  status: "idle",
  error: null,
  setupRequired: false,
};

const responseError = async (response: Response): Promise<MenuRequestError> => {
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

export const loadTelegramMenu = createAsyncThunk<
  MenuResponse,
  void,
  { rejectValue: MenuRequestError }
>("telegramMenu/load", async (_, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/telegram/menu", { cache: "no-store" });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as MenuResponse;
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

export const saveTelegramMenu = createAsyncThunk<
  { menu: TelegramMenu },
  TelegramMenu,
  { rejectValue: MenuRequestError }
>("telegramMenu/save", async (menu, { rejectWithValue }) => {
  try {
    const response = await fetch("/api/telegram/menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isEnabled: menu.isEnabled,
        isPersistent: menu.isPersistent,
        resizeKeyboard: menu.resizeKeyboard,
        oneTimeKeyboard: menu.oneTimeKeyboard,
        inputFieldPlaceholder: menu.inputFieldPlaceholder,
        buttons: menu.buttons.map((button) => ({
          label: button.label,
          rowIndex: button.rowIndex,
          position: button.position,
          actionType: button.actionType,
          flowId: button.flowId,
          automationId: button.automationId,
        })),
      }),
    });
    if (!response.ok) return rejectWithValue(await responseError(response));
    return (await response.json()) as { menu: TelegramMenu };
  } catch {
    return rejectWithValue({ message: "اتصال برقرار نشد؛ اینترنت را بررسی کنید." });
  }
});

const telegramMenuSlice = createSlice({
  name: "telegramMenu",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadTelegramMenu.pending, (state) => {
        state.status = "loading";
        state.error = null;
        state.setupRequired = false;
      })
      .addCase(loadTelegramMenu.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.menu = action.payload.menu;
        state.targets = action.payload.targets;
        state.connected = action.payload.connected;
      })
      .addCase(loadTelegramMenu.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload?.message ?? "منوی ربات بارگذاری نشد.";
        state.setupRequired = action.payload?.setupRequired ?? false;
      })
      .addCase(saveTelegramMenu.fulfilled, (state, action) => {
        state.menu = action.payload.menu;
      });
  },
});

export default telegramMenuSlice.reducer;
