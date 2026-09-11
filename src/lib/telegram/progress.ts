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
  let attempted = false;
  return {
    consume: async (event: RunProgressEvent) => {
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
        await transport.remove(id);
      } catch {
        /* Durable delivery retains unresolved cleanup for the recovery worker. */
      }
    },
  };
};
