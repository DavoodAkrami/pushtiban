export const FLOW_NAME_MAX_LENGTH = 100;
export const FLOW_NODE_MESSAGE_MAX_LENGTH = 4096;
export const FLOW_BUTTON_LABEL_MAX_LENGTH = 64;
export const FLOW_BACK_BUTTON_LABEL_MAX_LENGTH = 64;
export const FLOW_BUTTONS_PER_NODE_MAX = 8;
export const FLOW_URL_MAX_LENGTH = 2048;
export const DEFAULT_FLOW_BACK_BUTTON_LABEL = "بازگشت";

/** The channel a flow is authored for and delivered on. */
export type FlowChannel = "telegram" | "instagram";

export const DEFAULT_FLOW_CHANNEL: FlowChannel = "telegram";

export const isFlowChannel = (value: unknown): value is FlowChannel =>
  value === "telegram" || value === "instagram";

/**
 * What one message may carry on each channel.
 *
 * A flow belongs to one channel because these numbers are not close to each
 * other. Telegram renders an inline keyboard of up to eight buttons under a
 * 4096-character message and can rewrite that message in place; Instagram has
 * no inline keyboard at all, so a message with buttons is sent as a *button
 * template* — 640 characters, three buttons, twenty characters per label — and
 * nothing Instagram has sent can ever be edited.
 *
 * The Instagram numbers are Meta's, not ours, and are enforced in three places
 * for the usual reason: the editor so the owner sees the limit while typing,
 * the API so a hand-made request cannot get past it, and the database
 * (`supabase/instagram-flows.sql`) so a flow that cannot be delivered can never
 * be stored.
 */
export const FLOW_CHANNEL_LIMITS: Record<
  FlowChannel,
  {
    messageMaxLength: number;
    buttonsPerNodeMax: number;
    buttonLabelMaxLength: number;
    /** False when the channel cannot rewrite a message it has already sent. */
    supportsReplace: boolean;
    /** False when the channel has no bot-wide keyboard for a node to control. */
    supportsKeyboardAction: boolean;
    /** False when the channel has no slash commands to trigger a flow with. */
    supportsCommands: boolean;
  }
> = {
  telegram: {
    messageMaxLength: FLOW_NODE_MESSAGE_MAX_LENGTH,
    buttonsPerNodeMax: FLOW_BUTTONS_PER_NODE_MAX,
    buttonLabelMaxLength: FLOW_BUTTON_LABEL_MAX_LENGTH,
    supportsReplace: true,
    supportsKeyboardAction: true,
    supportsCommands: true,
  },
  instagram: {
    messageMaxLength: 640,
    buttonsPerNodeMax: 3,
    buttonLabelMaxLength: 20,
    supportsReplace: false,
    supportsKeyboardAction: false,
    supportsCommands: false,
  },
};

export const flowLimits = (channel: FlowChannel) => FLOW_CHANNEL_LIMITS[channel];

/** The column on automation_flows that ties a flow to its account. */
export const flowConnectionColumn = (channel: FlowChannel) =>
  channel === "instagram"
    ? ("instagram_connection_id" as const)
    : ("telegram_connection_id" as const);

/**
 * How many buttons a node actually spends on this channel.
 *
 * On Instagram the back button is rendered as an ordinary button — there is no
 * separate row for it — so it competes with the owner's own three.
 */
export const countRenderedButtons = (
  channel: FlowChannel,
  node: { buttons: unknown[]; backButtonEnabled: boolean }
) =>
  node.buttons.length +
  (channel === "instagram" && node.backButtonEnabled ? 1 : 0);

export type FlowButtonActionType = "node" | "url" | "end";

/**
 * What a message does to the bot's keyboard menu when it is delivered.
 * "inherit" leaves whatever the customer already has on screen.
 */
export type FlowKeyboardAction = "inherit" | "show" | "remove";

export const DEFAULT_FLOW_KEYBOARD_ACTION: FlowKeyboardAction = "inherit";

export const isFlowKeyboardAction = (
  value: unknown
): value is FlowKeyboardAction =>
  value === "inherit" || value === "show" || value === "remove";

export type FlowButton = {
  id: string;
  nodeId: string;
  flowId: string;
  label: string;
  actionType: FlowButtonActionType;
  nextNodeId: string | null;
  url: string | null;
  position: number;
};

export type FlowNode = {
  id: string;
  flowId: string;
  messageText: string;
  isRoot: boolean;
  replaceOnButtonClick: boolean;
  backButtonEnabled: boolean;
  backButtonLabel: string;
  keyboardAction: FlowKeyboardAction;
  buttons: FlowButton[];
};

export type AutomationFlow = {
  id: string;
  channel: FlowChannel;
  triggerType: "keyword" | "command";
  triggerKeyword: string;
  name: string;
  commandDescription: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutomationFlowDetail = AutomationFlow & {
  nodes: FlowNode[];
};
