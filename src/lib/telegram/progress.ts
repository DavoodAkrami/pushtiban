import type { RunProgressEvent } from "../ai/runtime/contracts";
export type ProgressTransport = {
  send: (text: string) => Promise<number | null>;
  edit: (id: number, text: string) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
};
/** Presentation only: the runtime supplies every displayed status string. */
export const createTelegramProgress = (
  transport: ProgressTransport,
  now = Date.now,
) => {
  let id: number | null = null;
  let lastEdit = 0;
  let latest: RunProgressEvent | null = null;
  let failed = false;
  let attempted = false;
  return {
    consume: async (event: RunProgressEvent) => {
      latest = event;
      if (event.code === "failed") failed = true;
      try {
        if (!attempted) {
          attempted = true;
          id = await transport.send(event.display_text);
          lastEdit = now();
        } else if (
          id !== null &&
          (event.code === "failed" || now() - lastEdit >= 900)
        ) {
          await transport.edit(id, event.display_text);
          lastEdit = now();
        }
      } catch {
        /* Final delivery must remain independent. */
      }
    },
    finish: async () => {
      if (id === null) return;
      try {
        if (failed && latest) await transport.edit(id, latest.display_text);
        else await transport.remove(id);
      } catch {
        /* Phase 3 owns delivery reconciliation. */
      }
    },
  };
};
