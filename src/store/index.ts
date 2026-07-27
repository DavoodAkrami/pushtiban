import { configureStore } from "@reduxjs/toolkit";
import automationsReducer from "./slices/automations-slice";
import flowsReducer from "./slices/flows-slice";
import sessionReducer from "./slices/session-slice";
import telegramMenuReducer from "./slices/telegram-menu-slice";
import usageReducer from "./slices/usage-slice";

// Server-side state only — UI state stays in React useState/useReducer.
export const makeStore = () =>
  configureStore({
    reducer: {
      automations: automationsReducer,
      flows: flowsReducer,
      session: sessionReducer,
      telegramMenu: telegramMenuReducer,
      usage: usageReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
