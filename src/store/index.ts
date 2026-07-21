import { configureStore } from "@reduxjs/toolkit";
import automationsReducer from "./slices/automations-slice";
import sessionReducer from "./slices/session-slice";

// Server-side state only — UI state stays in React useState/useReducer.
export const makeStore = () =>
  configureStore({
    reducer: {
      automations: automationsReducer,
      session: sessionReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
