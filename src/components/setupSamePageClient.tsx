import { Intent, Position, Toaster } from "@blueprintjs/core";
import renderToast from "roamjs-components/components/Toast";
import { v4 } from "uuid";
import getAuthorizationHeader from "roamjs-components/util/getAuthorizationHeader";
import { render as renderUsage } from "./UsageChart";
import {
  connectedGraphs,
  getConnectCode,
  getSetupCode,
  // load as loadP2P,
  receiveAnswer,
  // unload as unloadP2P,
} from "./setupP2PFeatures";
import apiClient, { isLegacy } from "../apiClient";
import type { Status, json } from "../types";
import {
  addGraphListener,
  handleMessage,
  receiveChunkedMessage,
} from "./setupMessageHandlers";
import { render as renderNotifications } from "./NotificationContainer";

const authenticationHandlers: {
  handler: () => Promise<unknown>;
  label: string;
}[] = [];

export const addAuthenticationHandler = (
  args: typeof authenticationHandlers[number]
) => authenticationHandlers.push(args);

export const removeAuthenticationHandler = (label: string) =>
  authenticationHandlers.splice(
    authenticationHandlers.findIndex((h) => h.label === label),
    1
  );

const CONNECTED_EVENT = "roamjs:samepage:connected";
const MESSAGE_LIMIT = 15750; // 16KB minus 250b buffer for metadata

const roamJsBackend: {
  channel?: WebSocket;
  status: Status;
  networkedGraphs: Set<string>;
} = {
  status: "DISCONNECTED",
  networkedGraphs: new Set(),
};

const sendChunkedMessage = ({
  data,
  sender,
}: {
  data: { [k: string]: json };
  sender: (data: { [k: string]: json }) => void;
}) => {
  const fullMessage = JSON.stringify(data);
  const uuid = v4();
  const size = new Blob([fullMessage]).size;
  const total = Math.ceil(size / MESSAGE_LIMIT);
  const chunkSize = Math.ceil(fullMessage.length / total);
  for (let chunk = 0; chunk < total; chunk++) {
    const message = fullMessage.slice(
      chunkSize * chunk,
      chunkSize * (chunk + 1)
    );
    sender({
      message,
      uuid,
      chunk,
      total,
    });
  }
};

const sendToBackend = ({
  operation,
  data = {},
  unauthenticated = false,
}: {
  operation: string;
  data?: { [key: string]: json };
  unauthenticated?: boolean;
}) => {
  const send = () =>
    sendChunkedMessage({
      data: {
        operation,
        ...data,
      },
      sender: (data) =>
        roamJsBackend.channel.send(
          JSON.stringify({
            action: "sendmessage",
            data,
          })
        ),
    });
  if (unauthenticated || roamJsBackend.status === "CONNECTED") send();
  else
    document.body.addEventListener(CONNECTED_EVENT, () => send(), {
      once: true,
    });
};

const onError = (e: { error: Error } | Event) => {
  if (
    "error" in e &&
    !e.error.message.includes("Transport channel closed") &&
    !e.error.message.includes("User-Initiated Abort, reason=Close called")
  ) {
    // handled in disconnect
    console.error(e);
    renderToast({
      id: "samepage-ws-error",
      content: `SamePage Error: ${e.error}`,
      intent: "danger",
    });
  }
};

const addConnectCommand = () => {
  removeDisconnectCommand();
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Connect to SamePage Network",
    callback: connectToBackend,
  });
};

const removeConnectCommand = () => {
  addDisconnectCommand();
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Connect to SamePage Network",
  });
};

const addDisconnectCommand = () => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Disconnect from SamePage Network",
    callback: () => {
      // https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
      // websocket closure codes
      roamJsBackend.channel.close(1000, "User Command");
      disconnectFromBackend("User Command");
    },
  });
};

const removeDisconnectCommand = () => {
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Disconnect from SamePage Network",
  });
};

const connectToBackend = () => {
  if (roamJsBackend.status === "DISCONNECTED") {
    roamJsBackend.status = "PENDING";
    roamJsBackend.channel = new WebSocket(process.env.WEB_SOCKET_URL);
    roamJsBackend.channel.onopen = () => {
      sendToBackend({
        operation: "AUTHENTICATION",
        data: isLegacy
          ? {
              token: getAuthorizationHeader(),
              graph: window.roamAlphaAPI.graph.name,
            }
          : {
              app: 1,
              workspace: window.roamAlphaAPI.graph.name,
            },
        unauthenticated: true,
      });
    };

    roamJsBackend.channel.onclose = (args) => {
      console.warn("Same page network disconnected:", args);
      disconnectFromBackend("Network Disconnected");
    };
    roamJsBackend.channel.onerror = (ev) => {
      onError(ev);
    };

    roamJsBackend.channel.onmessage = (data) => {
      if (JSON.parse(data.data).message === "Internal server error")
        renderToast({
          id: "network-error",
          content: `Unknown Internal Server Error. Request ID: ${
            JSON.parse(data.data).requestId
          }`,
          intent: "danger",
        });

      receiveChunkedMessage(data.data);
    };
  }
};

const disconnectFromBackend = (reason: string) => {
  if (roamJsBackend.status !== "DISCONNECTED") {
    roamJsBackend.status = "DISCONNECTED";
    roamJsBackend.networkedGraphs.clear();
    roamJsBackend.channel = undefined;
    renderToast({
      id: "samepage-disconnect",
      content: `Disconnected from SamePage Network: ${reason}`,
      intent: Intent.WARNING,
    });
  }
  addConnectCommand();
};

export const sendToGraph = ({
  graph,
  operation,
  data = {},
}: {
  graph: string;
  operation: string;
  data?: { [k: string]: json };
}) => {
  const connection = connectedGraphs[graph];

  if (connection?.status === "CONNECTED") {
    sendChunkedMessage({
      data: { operation, ...data },
      sender: (d) => connection.channel.send(JSON.stringify(d)),
    });
  } else if (roamJsBackend.channel && roamJsBackend.status === "CONNECTED") {
    sendToBackend({
      operation: "PROXY",
      data: isLegacy
        ? { ...data, graph, proxyOperation: operation }
        : { ...data, app: 1, workspace: graph, proxyOperation: operation },
    });
  }
};

const USAGE_LABEL = "View SamePage Usage";
const setupSamePageClient = ({
  isAutoConnect,
}: {
  isAutoConnect: boolean;
}): void => {
  addConnectCommand();
  if (isAutoConnect) {
    connectToBackend();
  }
  // loadP2P();

  addGraphListener({
    operation: "ERROR",
    handler: ({ message }: { message: string }) => {
      renderToast({
        id: "websocket-error",
        content: message,
        intent: "danger",
      });
      if (roamJsBackend.status === "PENDING") {
        roamJsBackend.channel.close(1000, "Error during pending connection");
        disconnectFromBackend("Error during pending connection");
      }
    },
  });

  addGraphListener({
    operation: "AUTHENTICATION",
    handler: (props: {
      success: boolean;
      reason?: string;
      messages: string[];
      graphs: string[];
    }) => {
      if (props.success) {
        roamJsBackend.status = "CONNECTED";
        roamJsBackend.networkedGraphs = new Set(props.graphs);
        document.body.dispatchEvent(new Event(CONNECTED_EVENT));
        removeConnectCommand();
        addAuthenticationHandler({
          handler: () => {
            if (props.messages.length) {
              const toaster = Toaster.create({
                position: Position.BOTTOM_RIGHT,
              });
              let progress = 0;
              toaster.show({
                intent: Intent.PRIMARY,
                message: `Loaded ${progress} of ${props.messages.length} remote messages...`,
                timeout: 0,
              });
              return Promise.all(
                props.messages.map((msg) =>
                  apiClient<{
                    data: string;
                    source: { workspace: string; app: number };
                  }>({
                    method: "load-message",
                    data: { messageUuid: msg },
                  }).then((r) => {
                    progress = progress + 1;
                    handleMessage(r.data, r.source.workspace);
                  })
                )
              ).finally(() => toaster.clear());
            } else {
              return Promise.resolve();
            }
          },
          label: "LOAD_MESSAGES",
        });
        Promise.all(authenticationHandlers.map(({ handler }) => handler()))
          .then(() => {
            renderToast({
              id: "samepage-success",
              content: "Successfully connected to SamePage Network!",
              intent: Intent.SUCCESS,
            });
          })
          .catch((e) => {
            roamJsBackend.status = "DISCONNECTED";
            roamJsBackend.channel.close();
            renderToast({
              id: "samepage-failure",
              content: `Failed to connect to SamePage Network: ${e.message}`,
              intent: Intent.DANGER,
            });
          });
      } else {
        roamJsBackend.status = "DISCONNECTED";
        roamJsBackend.channel.close();
        renderToast({
          id: "samepage-failure",
          content: `Failed to connect to SamePage Network: ${
            props.reason.includes("401")
              ? "Incorrect RoamJS Token"
              : props.reason
          }`,
          intent: Intent.DANGER,
        });
      }
    },
  });

  addGraphListener({
    operation: "INITIALIZE_P2P",
    handler: (props: { to: string; graph: string }) => {
      roamJsBackend.networkedGraphs.add(props.graph);
      getSetupCode({ label: props.graph }).then((offer) =>
        sendToBackend({ operation: "OFFER", data: { to: props.to, offer } })
      );
    },
  });

  addGraphListener({
    operation: "OFFER",
    handler: (props: { to: string; offer: string; graph: string }) => {
      getConnectCode({ offer: props.offer, label: props.graph }).then(
        (answer) =>
          sendToBackend({ operation: "ANSWER", data: { to: props.to, answer } })
      );
    },
  });

  addGraphListener({
    operation: "ANSWER",
    handler: (props: { answer: string }) => {
      receiveAnswer({ answer: props.answer });
    },
  });

  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: USAGE_LABEL,
    callback: () => {
      renderUsage({});
    },
  });
  renderNotifications({});
};

export const unloadSamePageClient = () => {
  window.roamAlphaAPI.ui.commandPalette.removeCommand({ label: USAGE_LABEL });
  if (roamJsBackend.channel)
    roamJsBackend.channel.close(1000, "Disabled Client");
  disconnectFromBackend("Disabled Client");
  removeConnectCommand();
  removeDisconnectCommand();
  // unloadP2P();
  Object.keys(connectedGraphs).forEach((g) => delete connectedGraphs[g]);
};

export default setupSamePageClient;
