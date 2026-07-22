export const FLOW_NAME_MAX_LENGTH = 100;
export const FLOW_NODE_MESSAGE_MAX_LENGTH = 4096;
export const FLOW_BUTTON_LABEL_MAX_LENGTH = 64;
export const FLOW_BACK_BUTTON_LABEL_MAX_LENGTH = 64;
export const FLOW_BUTTONS_PER_NODE_MAX = 8;
export const FLOW_URL_MAX_LENGTH = 2048;
export const DEFAULT_FLOW_BACK_BUTTON_LABEL = "بازگشت";

export type FlowButtonActionType = "node" | "url" | "end";

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
