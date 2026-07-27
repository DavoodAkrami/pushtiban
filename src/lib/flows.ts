export const FLOW_NAME_MAX_LENGTH = 100;
export const FLOW_NODE_MESSAGE_MAX_LENGTH = 4096;
export const FLOW_BUTTON_LABEL_MAX_LENGTH = 64;
export const FLOW_BACK_BUTTON_LABEL_MAX_LENGTH = 64;
export const FLOW_BUTTONS_PER_NODE_MAX = 8;
export const FLOW_URL_MAX_LENGTH = 2048;
export const DEFAULT_FLOW_BACK_BUTTON_LABEL = "بازگشت";

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
