import {
  Alert,
  Button,
  InputGroup,
  Label,
  Intent,
  Position,
  Toaster,
} from "@blueprintjs/core";
import React, { useCallback, useEffect, useState } from "react";
import getGraph from "roamjs-components/util/getGraph";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import renderToast from "roamjs-components/components/Toast";
import { v4 } from "uuid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSubTree from "roamjs-components/util/getSubTree";
import getAuthorizationHeader from "roamjs-components/util/getAuthorizationHeader";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import { isSafari } from "mobile-device-detect";

const FAILED_STATES = ["failed", "closed"];

// These RTC objects are not JSON serializable -.-
const serialize = ({
  candidates,
  description,
  label,
}: {
  candidates: RTCIceCandidate[];
  description: RTCSessionDescriptionInit;
  label: string;
}) =>
  window.btoa(
    JSON.stringify({
      description: {
        type: description.type,
        sdp: description.sdp,
      },
      candidates: candidates.map((c) => c.toJSON()),
      label,
    })
  );

const deserialize = (
  s: string
): {
  candidates: RTCIceCandidate[];
  description: RTCSessionDescriptionInit;
  label: string;
} => JSON.parse(window.atob(s));

const gatherCandidates = (con: RTCPeerConnection) => {
  const candidates: RTCIceCandidate[] = [];
  return new Promise<RTCIceCandidate[]>((resolve) => {
    con.onicegatheringstatechange = (e) => {
      const state = (e.target as RTCPeerConnection).iceGatheringState;
      if (state === "complete") {
        resolve(candidates);
      }
    };
    con.onicecandidate = (c) => {
      if (c.candidate) {
        candidates.push(c.candidate);
      }
    };
  });
};

export type json =
  | string
  | number
  | boolean
  | null
  | { toJSON: () => string }
  | json[]
  | { [key: string]: json };
type MessageHandlers = {
  [operation: string]: (data: json, graph: string) => void;
};
export type Status = "DISCONNECTED" | "PENDING" | "CONNECTED";

export const messageHandlers: MessageHandlers = {
  ERROR: ({ message }: { message: string }) =>
    renderToast({
      id: "websocket-error",
      content: message,
      intent: "danger",
    }),
  AUTHENTICATION: (props: {
    success: boolean;
    reason?: string;
    messages: string[];
    graphs: string[];
  }) => {
    if (props.success) {
      roamJsBackend.status = "CONNECTED";
      roamJsBackend.networkedGraphs = new Set(props.graphs);
      document.body.dispatchEvent(new Event("roamjs:multiplayer:connected"));
      updateOnlineGraphs();
      if (props.messages.length) {
        const toaster = Toaster.create({ position: Position.BOTTOM_RIGHT });
        let progress = 0;
        toaster.show({
          intent: Intent.PRIMARY,
          message: `Loaded ${progress} of ${props.messages.length} remote messages...`,
          timeout: 0,
        });
        Promise.all(
          props.messages.map(
            (msg) =>
              new Promise<void>((innerResolve) => {
                const response = `LOAD_MESSAGE/${msg}`;
                messageHandlers[response] = () => {
                  delete messageHandlers[response];
                  progress = progress + 1;
                  innerResolve();
                };
                sendToBackend({
                  operation: "LOAD_MESSAGE",
                  data: { messageUuid: msg },
                });
              })
          )
        ).then(() => toaster.clear());
      } else {
        renderToast({
          id: "multiplayer-success",
          content: "Successfully connected to RoamJS Multiplayer!",
          intent: Intent.SUCCESS,
        });
      }
      removeConnectCommand();
    } else {
      roamJsBackend.status = "DISCONNECTED";
      roamJsBackend.channel.close();
      renderToast({
        id: "multiplayer-failure",
        content: `Failed to connect to RoamJS Multiplayer: ${
          props.reason.includes("401") ? "Incorrect RoamJS Token" : props.reason
        }`,
        intent: Intent.DANGER,
      });
      updateOnlineGraphs();
    }
  },
  INITIALIZE_P2P: (props: { to: string; graph: string }) => {
    roamJsBackend.networkedGraphs.add(props.graph);
    getSetupCode({ label: props.graph }).then((offer) =>
      sendToBackend({ operation: "OFFER", data: { to: props.to, offer } })
    );
  },
  OFFER: (props: { to: string; offer: string; graph: string }) => {
    getConnectCode({ offer: props.offer, label: props.graph }).then((answer) =>
      sendToBackend({ operation: "ANSWER", data: { to: props.to, answer } })
    );
  },
  ANSWER: (props: { answer: string }) => {
    receiveAnswer({ answer: props.answer });
  },
  LEAVE_NETWORK: (props: { graph: string }) => {
    roamJsBackend.networkedGraphs.delete(props.graph);
    delete connectedGraphs[props.graph];
    updateOnlineGraphs();
  },
};
export const ONLINE_GRAPHS_ID = "roamjs-online-graphs-container";
const updateOnlineGraphs = () => {
  const onlineElement = document.getElementById(ONLINE_GRAPHS_ID);
  if (onlineElement) {
    onlineElement.dispatchEvent(new Event("roamjs:multiplayer:graphs"));
  }
};
export const connectedGraphs: {
  [graph: string]: {
    connection: RTCPeerConnection;
    channel: RTCDataChannel;
    status: Status;
  };
} = {};
export const roamJsBackend: {
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

const ongoingMessages: { [uuid: string]: string[] } = {};
const receiveChunkedMessage = (str: string, graph?: string) => {
  const { message, uuid, chunk, total } = JSON.parse(str);
  if (!ongoingMessages[uuid]) {
    ongoingMessages[uuid] = [];
  }
  const ongoingMessage = ongoingMessages[uuid];
  ongoingMessage[chunk] = message;
  if (ongoingMessage.filter((c) => !!c).length === total) {
    delete ongoingMessages[uuid];
    const { operation, ...props } = JSON.parse(ongoingMessage.join(""));
    const handler = messageHandlers[operation];
    if (handler) handler(props, graph || props.graph || "");
    else if (!props.ephemeral)
      renderToast({
        id: `network-error-${operation}`,
        content: `Unknown network operation: ${operation}`,
        intent: "danger",
      });
  }
};

export const sendToBackend = ({
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
    document.body.addEventListener(
      "roamjs:multiplayer:connected",
      () => send(),
      { once: true }
    );
};

type AlertProps = { onClose: () => void };
const onError = (e: { error: Error } & Event) => {
  if (
    !e.error.message.includes("Transport channel closed") &&
    !e.error.message.includes("User-Initiated Abort, reason=Close called")
  ) {
    // handled in disconnect
    console.error(e);
    renderToast({
      id: "multiplayer-send-error",
      content: `Multiplayer Error: ${e.error}`,
      intent: "danger",
    });
  }
};
const onDisconnect = (graph: string) => () => {
  if (connectedGraphs[graph].status !== "DISCONNECTED") {
    renderToast({
      id: "multiplayer-disconnect",
      content: `Disconnected from graph ${graph}`,
      intent: "warning",
    });
    connectedGraphs[graph].status = "DISCONNECTED";
    updateOnlineGraphs();
  }
};
const onConnect = ({
  e,
  connection,
  channel,
  callback,
}: {
  e: MessageEvent;
  channel: RTCDataChannel;
  connection: RTCPeerConnection;
  callback: () => void;
}) => {
  const name = e.data;
  renderToast({
    id: `multiplayer-on-connect`,
    content: `Successfully connected to graph: ${name}!`,
  });
  callback();
  connectedGraphs[name] = {
    connection,
    channel,
    status: "CONNECTED",
  };
  updateOnlineGraphs();
  channel.addEventListener("message", (e) => {
    receiveChunkedMessage(e.data, name);
  });
  channel.onclose = onDisconnect(name);
  connection.addEventListener("connectionstatechange", () => {
    if (FAILED_STATES.includes(connection.connectionState)) {
      onDisconnect(name)();
    }
  });
};

const getPeerConnection = (onClose?: () => void) => {
  const connection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:35.173.242.123:3478?transport=tcp",
        username: "roamjs",
        credential: "multiplayer",
      },
    ],
  });
  const disconnectStateHandler = () => {
    if (FAILED_STATES.includes(connection.iceConnectionState)) {
      renderToast({
        id: "multiplayer-failed-connection",
        content: "Failed to connect to graph",
        intent: Intent.DANGER,
      });
      onClose?.();
    }
  };
  connection.addEventListener(
    "iceconnectionstatechange",
    disconnectStateHandler
  );
  return {
    connection,
    cleanup: () => {
      connection.removeEventListener(
        "iceconnectionstatechange",
        disconnectStateHandler
      );
    },
  };
};

export const getSetupCode = ({
  onClose,
  label = v4(),
}: {
  onClose?: () => void;
  label?: string;
}) => {
  const { connection, cleanup } = getPeerConnection(onClose);
  const sendChannel = connection.createDataChannel(label);
  connectedGraphs[label] = {
    connection,
    channel: sendChannel,
    status: "PENDING",
  };
  updateOnlineGraphs();
  const connectionHandler = (e: MessageEvent) => {
    onConnect({
      e,
      connection,
      channel: sendChannel,
      callback: () => {
        delete connectedGraphs[label];
        sendChannel.removeEventListener("message", connectionHandler);
        onClose?.();
        cleanup();
      },
    });
  };
  sendChannel.addEventListener("message", connectionHandler);
  sendChannel.onerror = onError;
  sendChannel.onopen = () => {
    sendChannel.send(getGraph());
  };
  return Promise.all([
    gatherCandidates(connection),
    connection.createOffer().then((offer) => {
      return connection.setLocalDescription(offer);
    }),
  ]).then(([candidates]) => {
    return serialize({
      candidates,
      description: connection.localDescription,
      label,
    });
  });
};

const getConnectCode = ({
  offer,
  onClose,
  label = v4(),
}: {
  offer: string;
  onClose?: () => void;
  label?: string;
}) => {
  const { connection, cleanup } = getPeerConnection(onClose);
  connection.ondatachannel = (event) => {
    const receiveChannel = event.channel;
    connectedGraphs[label] = {
      connection,
      channel: receiveChannel,
      status: "PENDING",
    };
    updateOnlineGraphs();
    const connectionHandler = (e: MessageEvent) => {
      onConnect({
        e,
        connection,
        channel: receiveChannel,
        callback: () => {
          delete connectedGraphs[label];
          cleanup();
          receiveChannel.send(getGraph());
          receiveChannel.removeEventListener("message", connectionHandler);
        },
      });
    };
    receiveChannel.addEventListener("message", connectionHandler);
    receiveChannel.onopen = onClose;
    receiveChannel.onerror = onError;
  };
  return Promise.all([
    gatherCandidates(connection),
    new Promise<string>((resolve) => {
      const { candidates, description, label } = deserialize(offer);
      connection
        .setRemoteDescription(new RTCSessionDescription(description))
        .then(() => {
          return Promise.all(
            candidates.map((c) =>
              connection.addIceCandidate(new RTCIceCandidate(c))
            )
          );
        })
        .then(() => {
          return connection.createAnswer();
        })
        .then((answer) =>
          connection.setLocalDescription(answer).then(() => resolve(label))
        );
    }),
  ]).then(([candidates, label]) => {
    return serialize({
      candidates,
      description: connection.localDescription,
      label,
    });
  });
};

const receiveAnswer = ({ answer }: { answer: string }) => {
  const { candidates, description, label } = deserialize(answer);
  const connection = connectedGraphs[label]?.connection;
  if (connection) {
    connection
      .setRemoteDescription(new RTCSessionDescription(description))
      .then(() =>
        Promise.all(
          candidates.map((c) =>
            connection.addIceCandidate(new RTCIceCandidate(c))
          )
        )
      );
  } else {
    renderToast({
      id: "connection-answer-error",
      intent: Intent.DANGER,
      content: `Error: No graph setup for connection with label: ${label}`,
    });
    console.error("Available labels:");
    console.error(Object.keys(connectedGraphs));
  }
};

const SetupAlert = ({ onClose }: AlertProps) => {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [readyToRecieve, setReadyToRecieve] = useState(isSafari);
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState("");
  useEffect(() => {
    getSetupCode({ onClose }).then(setCode);
  }, [setLoading]);
  return (
    <Alert
      loading={!readyToRecieve || loading}
      isOpen={true}
      onConfirm={() => {
        setLoading(true);
        receiveAnswer({ answer });
      }}
      canOutsideClickCancel
      confirmButtonText={"Connect"}
      onCancel={() => {
        onClose();
      }}
      style={isSafari ? { minWidth: 800 } : {}}
      // @ts-ignore
      title={"Setup Multiplayer Connection"}
    >
      {!isSafari ? (
        <>
          <p>
            Click the button below to copy the handshake code and send it to
            your peer:
          </p>
          <p>
            <Button
              style={{ minWidth: 120 }}
              disabled={!code || loading}
              onClick={() => {
                window.navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => {
                  setReadyToRecieve(true);
                  setCopied(false);
                }, 3000);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </p>
        </>
      ) : (
        <>
          <p>Copy the handshake code and send it to your peer:</p>
          <pre>{code}</pre>
        </>
      )}
      <p>Then, enter the handshake code sent by your peer:</p>
      <Label>
        Peer's Handshake Code
        <InputGroup
          value={answer}
          disabled={!readyToRecieve || loading}
          onChange={(e) => {
            setAnswer(e.target.value);
            setLoading(!e.target.value);
          }}
          style={{ wordBreak: "keep-all" }}
        />
      </Label>
      <p>Finally, click connect below:</p>
    </Alert>
  );
};

const ConnectAlert = ({ onClose }: AlertProps) => {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offer, setOffer] = useState("");
  const [code, setCode] = useState("");
  const onConfirm = useCallback(() => {
    setLoading(true);
    getConnectCode({
      offer,
      onClose,
    }).then((code) => {
      window.navigator.clipboard.writeText(code);
      setCopied(true);
      setCode(code);
    });
  }, [setLoading, offer, setCopied, setCode]);
  return (
    <Alert
      loading={loading}
      isOpen={true}
      onConfirm={onConfirm}
      canOutsideClickCancel
      confirmButtonText={"Connect"}
      onCancel={() => {
        onClose();
      }}
      style={isSafari ? { minWidth: 800 } : {}}
      // @ts-ignore
      title={"Connect to Multiplayer Host"}
    >
      {copied ? (
        !isSafari ? (
          <p>A response handshake code was copied! Send it to your peer.</p>
        ) : (
          <>
            <p>
              Now copy the handshake code below and send it back to your peer.
            </p>
            <pre>{code}</pre>
          </>
        )
      ) : (
        <>
          <p>Enter the handshake code sent by your peer:</p>
          <Label>
            Peer's Handshake Code
            <InputGroup
              value={offer}
              onChange={(e) => {
                setOffer(e.target.value);
              }}
              disabled={loading}
              style={{ wordBreak: "keep-all" }}
            />
          </Label>
          <p>Then, click connect below:</p>
        </>
      )}
    </Alert>
  );
};

const MESSAGE_LIMIT = 15750; // 16KB minus 250b buffer for metadata
const addConnectCommand = () => {
  removeDisconnectCommand();
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Connect to RoamJS Multiplayer",
    callback: connectToBackend,
  });
};

const removeConnectCommand = () => {
  addDisconnectCommand();
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Connect to RoamJS Multiplayer",
  });
};

const addDisconnectCommand = () => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Disconnect from RoamJS Multiplayer",
    callback: disconnectFromBackend,
  });
};

const removeDisconnectCommand = () => {
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Disconnect from RoamJS Multiplayer",
  });
};

const connectToBackend = () => {
  if (roamJsBackend.status === "DISCONNECTED") {
    roamJsBackend.status = "PENDING";
    roamJsBackend.channel = new WebSocket(process.env.WEB_SOCKET_URL);
    roamJsBackend.channel.onopen = () => {
      sendToBackend({
        operation: "AUTHENTICATION",
        data: { token: getAuthorizationHeader(), graph: getGraph() },
        unauthenticated: true,
      });
    };

    roamJsBackend.channel.onclose = disconnectFromBackend;
    roamJsBackend.channel.onerror = onError;

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
    updateOnlineGraphs();
  }
};

const disconnectFromBackend = () => {
  if (roamJsBackend.status !== "DISCONNECTED") {
    roamJsBackend.status = "DISCONNECTED";
    roamJsBackend.networkedGraphs.clear();
    roamJsBackend.channel = undefined;
    renderToast({
      id: "multiplayer-disconnect",
      content: "Disconnected from RoamJS Multiplayer",
      intent: Intent.WARNING,
    });
    updateOnlineGraphs();
  }
  addConnectCommand();
};

export const toggleOnAsync = () => {
  const tree = getBasicTreeByParentUid(
    getPageUidByPageTitle("roam/js/multiplayer")
  );
  const asyncModeTree = getSubTree({ tree, key: "Asynchronous" });
  const disableAutoConnect = getSubTree({
    tree: asyncModeTree.children,
    key: "Disable Auto Connect",
  }).uid;
  addConnectCommand();
  if (!disableAutoConnect) connectToBackend();
};

const setupMultiplayer = (configUid: string) => {
  const tree = getBasicTreeByParentUid(configUid);
  const asyncModeTree = getSubTree({ tree, key: "Asynchronous" });
  const getConnectedGraphs = () =>
    Object.keys(connectedGraphs).filter(
      (g) => connectedGraphs[g].status === "CONNECTED"
    );
  return {
    addGraphListener: ({
      operation,
      handler,
    }: {
      operation: string;
      handler: (e: json, graph: string) => void;
    }) => {
      messageHandlers[operation] = handler;
    },
    removeGraphListener: ({ operation }: { operation: string }) => {
      delete messageHandlers[operation];
    },
    sendToGraph: ({
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
      } else if (
        roamJsBackend.channel &&
        roamJsBackend.status === "CONNECTED"
      ) {
        sendToBackend({
          operation: "PROXY",
          data: { ...data, graph, proxyOperation: operation },
        });
      }
    },
    getConnectedGraphs,
    getNetworkedGraphs: () =>
      Array.from(
        new Set([...roamJsBackend.networkedGraphs, ...getConnectedGraphs()])
      ),
    enable: () => {
      if (asyncModeTree.uid) {
        toggleOnAsync();
      }
      window.roamAlphaAPI.ui.commandPalette.addCommand({
        label: "Setup Multiplayer",
        callback: () => {
          createOverlayRender<Omit<AlertProps, "onClose">>(
            "multiplayer-setup",
            SetupAlert
          )({ messageHandlers });
        },
      });
      window.roamAlphaAPI.ui.commandPalette.addCommand({
        label: "Connect To Graph",
        callback: () => {
          createOverlayRender<Omit<AlertProps, "onClose">>(
            "multiplayer-connect",
            ConnectAlert
          )({ messageHandlers });
        },
      });
    },
    disable: () => {
      if (asyncModeTree.uid) {
        disconnectFromBackend();
        removeConnectCommand();
        removeDisconnectCommand();
      }
      window.roamAlphaAPI.ui.commandPalette.removeCommand({
        label: "Connect To Graph",
      });
      window.roamAlphaAPI.ui.commandPalette.removeCommand({
        label: "Setup Multiplayer",
      });
      Object.keys(connectedGraphs).forEach((g) => delete connectedGraphs[g]);
    },
  };
};

export type MessageLoaderProps = Pick<
  ReturnType<typeof setupMultiplayer>,
  "addGraphListener" | "sendToGraph" | "getNetworkedGraphs"
>;

export default setupMultiplayer;
