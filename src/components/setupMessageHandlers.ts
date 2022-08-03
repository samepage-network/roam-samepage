import { render as renderToast } from "roamjs-components/components/Toast";
import { json, MessageHandlers } from "../types";

const messageHandlers: MessageHandlers = {}

const handleMessage = (content: string, graph?: string) => {
  const { operation, ...props } = JSON.parse(content);
  const handler = messageHandlers[operation];
  if (handler) handler(props, graph || props.graph || "");
  else if (!props.ephemeral)
    renderToast({
      id: `network-error-${operation}`,
      content: `Unknown network operation: ${
        operation || "No operation specified"
      }`,
      intent: "danger",
    });
};

const ongoingMessages: { [uuid: string]: string[] } = {};
export const receiveChunkedMessage = (str: string, graph?: string) => {
  const { message, uuid, chunk, total } = JSON.parse(str);
  if (!ongoingMessages[uuid]) {
    ongoingMessages[uuid] = [];
  }
  const ongoingMessage = ongoingMessages[uuid];
  ongoingMessage[chunk] = message;
  if (ongoingMessage.filter((c) => !!c).length === total) {
    delete ongoingMessages[uuid];
    handleMessage(ongoingMessage.join(""), graph);
  }
};

export const addGraphListener = ({
  operation,
  handler,
}: {
  operation: string;
  handler: (e: json, graph: string) => void;
}) => {
  messageHandlers[operation] = handler;
};

export const removeGraphListener = ({ operation }: { operation: string }) => {
  delete messageHandlers[operation];
};
