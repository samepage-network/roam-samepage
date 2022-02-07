import {
  Alert,
  Button,
  InputGroup,
  Label,
  Popover,
  Position,
  Radio,
  RadioGroup,
  Tooltip,
} from "@blueprintjs/core";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import getGraph from "roamjs-components/util/getGraph";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";
import { v4 } from "uuid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSubTree from "roamjs-components/util/getSubTree";

// These RTC objects are not JSON serializable -.-
const serialize = ({
  candidates,
  description,
}: {
  candidates: RTCIceCandidate[];
  description: RTCSessionDescriptionInit;
}) =>
  window.btoa(
    JSON.stringify({
      description: {
        type: description.type,
        sdp: description.sdp,
      },
      candidates: candidates.map((c) => c.toJSON()),
    })
  );

const deserialize = (
  s: string
): {
  candidates: RTCIceCandidate[];
  description: RTCSessionDescriptionInit;
} => JSON.parse(window.atob(s));

const gatherCandidates = (con: RTCPeerConnection) => {
  const candidates: RTCIceCandidate[] = [];
  return new Promise<RTCIceCandidate[]>((resolve) => {
    con.onicegatheringstatechange = (e) =>
      (e.target as RTCPeerConnection).iceGatheringState === "complete" &&
      resolve(candidates);
    con.onicecandidate = (c) => {
      if (c.candidate) {
        candidates.push(c.candidate);
      }
    };
  });
};

const Multiplayer = (): React.ReactElement => {
  const [graphs, setGraphs] = useState<string[]>([]);
  return (
    <span>
      <Popover
        position={Position.BOTTOM}
        content={
          <div style={{ padding: 16, width: 240 }}>
            {graphs.length ? (
              <ul style={{ padding: 0, margin: 0 }}>
                {graphs.map((g) => (
                  <li
                    key={g}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{g}</span>{" "}
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        background:
                          connectedGraphs[g].status === "CONNECTED"
                            ? "#0F9960"
                            : connectedGraphs[g].status === "PENDING"
                            ? "#d9822b"
                            : "#99280f",
                        borderRadius: 6,
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p>No Graphs Connected</p>
            )}
          </div>
        }
      >
        <Tooltip content={"Multiplayer Settings"}>
          <Button
            icon={"graph"}
            minimal
            onClick={() => setGraphs(Object.keys(connectedGraphs))}
          />
        </Tooltip>
      </Popover>
    </span>
  );
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
const connectedGraphs: {
  [graph: string]: {
    channel: RTCDataChannel;
    status: "DISCONNECTED" | "PENDING" | "CONNECTED";
  };
} = {};
const PEER_CONNECTION_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type AlertProps = { onClose: () => void; messageHandlers: MessageHandlers };
const onError = (e: { error: Error } & Event) => {
  if (!e.error.message.includes("Transport channel closed")) {
    // handled in disconnect
    console.error(e);
    renderToast({
      id: "multiplayer-send-error",
      content: `Multiplayer Error: ${e.error}`,
      intent: "danger",
    });
  }
};
const onDisconnect = (graph: string) => (e: Event) => {
  console.warn(e);
  renderToast({
    id: "multiplayer-disconnect",
    content: `Disconnected from graph ${graph}`,
    intent: "warning",
  });
  connectedGraphs[graph].status = "DISCONNECTED";
};
const onConnect = ({
  e,
  channel,
  callback,
  messageHandlers,
}: {
  e: MessageEvent;
  channel: RTCDataChannel;
  callback: () => void;
  messageHandlers: MessageHandlers;
}) => {
  const name = e.data;
  renderToast({
    id: `multiplayer-on-connect`,
    content: `Successfully connected to graph: ${name}!`,
  });
  connectedGraphs[name] = {
    channel,
    status: "CONNECTED",
  };
  callback();
  const ongoingMessages: { [uuid: string]: string[] } = {};
  channel.addEventListener("message", (e) => {
    const { message, uuid, chunk, total } = JSON.parse(e.data);
    if (!ongoingMessages[uuid]) {
      ongoingMessages[uuid] = [];
    }
    const ongoingMessage = ongoingMessages[uuid];
    ongoingMessage[chunk] = message;
    if (ongoingMessage.filter((c) => !!c).length === total) {
      console.log("Received full message");
      delete ongoingMessages[uuid];
      const { operation, ...data } = JSON.parse(ongoingMessage.join(""));
      messageHandlers[operation]?.(data, name);
    } else {
      console.log(`Received chunk ${chunk + 1} of ${total}`);
    }
  });
  channel.onclose = onDisconnect(name);
};

const getSetupCode = ({
  onClose,
  ref,
  messageHandlers,
}: {
  onClose: () => void;
  messageHandlers: MessageHandlers;
  ref: { current?: RTCPeerConnection };
}) => {
  const graph = getGraph();
  const localConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
  ref.current = localConnection;
  const sendChannel = localConnection.createDataChannel(graph);
  const connectionHandler = (e: MessageEvent) => {
    onConnect({
      e,
      channel: sendChannel,
      callback: () => {
        sendChannel.removeEventListener("message", connectionHandler);
        onClose();
      },
      messageHandlers,
    });
  };
  sendChannel.addEventListener("message", connectionHandler);
  sendChannel.onerror = onError;
  sendChannel.onopen = () => {
    sendChannel.send(graph);
  };
  return Promise.all([
    gatherCandidates(localConnection),
    localConnection.createOffer().then((offer) => {
      return localConnection.setLocalDescription(offer);
    }),
  ]).then(([candidates]) => {
    return serialize({
      candidates,
      description: localConnection.localDescription,
    });
  });
};

const receiveAnswer = ({
  onClose,
  ref,
  answer,
}: {
  onClose: () => void;
  ref: { current?: RTCPeerConnection };
  answer: string;
}) => {
  const { candidates, description } = deserialize(answer);

  ref.current
    .setRemoteDescription(new RTCSessionDescription(description))
    .then(() =>
      Promise.all(
        candidates.map((c) =>
          ref.current.addIceCandidate(new RTCIceCandidate(c))
        )
      ).then(() => {
        const checkIce = () => {
          if (ref.current.iceConnectionState === "disconnected") {
            renderToast({
              id: "multiplayer-failed-connection",
              content: "Failed to setup multiplayer connection",
            });
            onClose();
          } else if (ref.current.iceConnectionState === "checking") {
            setTimeout(checkIce, 10);
          }
        };
        checkIce();
      })
    );
};

const getConnectCode = ({
  offer,
  onClose,
  ref,
  messageHandlers,
}: {
  offer: string;
  onClose: () => void;
  messageHandlers: MessageHandlers;
  ref: { current?: RTCPeerConnection };
}) => {
  const remoteConnection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
  ref.current = remoteConnection;
  remoteConnection.ondatachannel = (event) => {
    const receiveChannel = event.channel;
    const connectionHandler = (e: MessageEvent) => {
      onConnect({
        e,
        channel: receiveChannel,
        callback: () => {
          receiveChannel.send(getGraph());
          receiveChannel.removeEventListener("message", connectionHandler);
        },
        messageHandlers,
      });
    };
    receiveChannel.addEventListener("message", connectionHandler);
    receiveChannel.onopen = onClose;
    receiveChannel.onerror = onError;
  };
  return Promise.all([
    gatherCandidates(remoteConnection),
    new Promise<void>((resolve) => {
      const { candidates, description } = deserialize(offer);
      remoteConnection
        .setRemoteDescription(new RTCSessionDescription(description))
        .then(() => {
          return Promise.all(
            candidates.map((c) =>
              remoteConnection.addIceCandidate(new RTCIceCandidate(c))
            )
          );
        })
        .then(() => {
          return remoteConnection.createAnswer();
        })
        .then((answer) =>
          remoteConnection.setLocalDescription(answer).then(resolve)
        );
    }),
  ]).then(([candidates]) => {
    const checkIce = () => {
      if (ref.current.iceConnectionState === "disconnected") {
        renderToast({
          id: "multiplayer-failed-connection",
          content: "Failed to connect to graph",
        });
        onClose();
      } else if (ref.current.iceConnectionState === "checking") {
        setTimeout(checkIce, 10);
      }
    };
    checkIce();
    return serialize({
      candidates,
      description: remoteConnection.localDescription,
    });
  });
};

const SetupAlert = ({ onClose, messageHandlers }: AlertProps) => {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [readyToRecieve, setReadyToRecieve] = useState(false);
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState("");
  const connectionRef = useRef<RTCPeerConnection>();
  useEffect(() => {
    getSetupCode({ messageHandlers, onClose, ref: connectionRef }).then(
      setCode
    );
  }, [setLoading, connectionRef]);
  return (
    <Alert
      loading={!readyToRecieve || loading}
      isOpen={true}
      onConfirm={() => {
        setLoading(true);
        receiveAnswer({ answer, onClose, ref: connectionRef });
      }}
      canOutsideClickCancel
      confirmButtonText={"Connect"}
      onCancel={() => {
        onClose();
      }}
    >
      <p>
        Click the button below to copy the handshake code and send it to your
        peer:
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
        />
      </Label>
      <p>Finally, click connect below:</p>
    </Alert>
  );
};

const ConnectAlert = ({ onClose, messageHandlers }: AlertProps) => {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offer, setOffer] = useState("");
  const connectionRef = useRef<RTCPeerConnection>();
  const onConfirm = useCallback(() => {
    setLoading(true);
    getConnectCode({
      ref: connectionRef,
      offer,
      onClose,
      messageHandlers,
    }).then((code) => {
      window.navigator.clipboard.writeText(code);
      setCopied(true);
    });
  }, [setLoading, offer, connectionRef, setCopied]);
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
    >
      {copied ? (
        <p>A response handshake code was copied! Send it to your peer.</p>
      ) : (
        <>
          <p>Enter the handshake code sent by your peer:</p>
          <Label>
            Peer's Handshake Code
            <InputGroup
              value={offer}
              onChange={(e) => {
                setOffer(e.target.value);
                setLoading(!e.target.value);
              }}
              disabled={loading}
            />
          </Label>
          <p>Then, click connect below:</p>
        </>
      )}
    </Alert>
  );
};

const AsyncAlert = ({ onClose, messageHandlers }: AlertProps) => {
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<{ id: string; code: string }[]>([]);
  const codeById = useMemo(
    () => Object.fromEntries(rooms.map((r) => [r.id, r.code])),
    [rooms]
  );
  const [selectedRoom, setSelectedRoom] = useState("");
  const connectionRef = useRef<RTCPeerConnection>();
  const wsRef = useRef<WebSocket>();
  useEffect(() => {
    wsRef.current = new WebSocket(process.env.WEB_SOCKET_URL);
    wsRef.current.onopen = () => {
      wsRef.current.send(
        JSON.stringify({
          action: "sendmessage",
          data: { operation: "LIST_ROOMS" },
        })
      );
    };

    wsRef.current.onclose = () => {
      console.log("disconnected");
    };

    wsRef.current.onmessage = (data) => {
      console.log(`Received message on ${new Date()}`);
      console.log(data.data);
      const { operation, ...props } = JSON.parse(data.data);
      if (operation === "LIST_ROOMS") {
        setLoading(false);
        setRooms(props.rooms);
      } else if (operation === "ERROR") {
        renderToast({
          id: "websocket-error",
          content: props.message,
          intent: "danger",
        });
      } else if (operation === "JOIN") {
        receiveAnswer({ answer: props.code, onClose, ref: connectionRef });
      } else {
        renderToast({
          id: "websocket-error",
          content: `Unknown websocket operation: ${operation}`,
          intent: "danger",
        });
      }
    };
  }, [connectionRef]);
  return (
    <Alert
      loading={loading}
      isOpen={true}
      onConfirm={() => {
        if (!selectedRoom) return;
        onClose();

        if (selectedRoom === "NEW") {
          const closeToast = renderToast({
            id: "multiplayer-async-setup",
            content: "Connected to network, waiting for peers...",
            timeout: 0,
            position: Position.BOTTOM_RIGHT
          });
          getSetupCode({
            onClose: closeToast,
            messageHandlers,
            ref: connectionRef,
          }).then((code) =>
            wsRef.current.send(
              JSON.stringify({
                action: "sendmessage",
                data: {
                  room: getGraph(),
                  code,
                  operation: "HOST",
                },
              })
            )
          );
        } else {
          const closeToast = renderToast({
            id: "multiplayer-async-connect",
            content: `Attempting to connect to ${selectedRoom}`,
            timeout: 0,
            position: Position.BOTTOM_RIGHT,
          });
          getConnectCode({
            onClose: closeToast,
            ref: connectionRef,
            messageHandlers,
            offer: codeById[selectedRoom],
          }).then((code) =>
            wsRef.current.send(
              JSON.stringify({
                action: "sendmessage",
                data: {
                  room: selectedRoom,
                  code,
                  operation: "JOIN",
                },
              })
            )
          );
        }
      }}
      canOutsideClickCancel
      confirmButtonText={"Connect"}
      onCancel={onClose}
    >
      <h3>Multiplayer Rooms</h3>
      <div style={{ height: 360 }}>
        {!loading && (
          <RadioGroup
            selectedValue={selectedRoom}
            onChange={(e) =>
              setSelectedRoom((e.target as HTMLInputElement).value)
            }
          >
            {rooms.map((r) => (
              <Radio value={r.id} label={r.id} key={r.id} />
            ))}
            <Radio value={"NEW"} label="NEW" />
          </RadioGroup>
        )}
      </div>
    </Alert>
  );
};

const MESSAGE_LIMIT = 15900; // 16KB minus 100b buffer for metadata

export const setupMultiplayer = (configUid: string) => {
  const messageHandlers: MessageHandlers = {};
  const tree = getBasicTreeByParentUid(configUid);
  const asyncModeTree = getSubTree({ tree, key: "Asynchronous" });
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
      const message = JSON.stringify({ operation, ...data });
      const uuid = v4();
      const size = new Blob([message]).size;
      const total = Math.ceil(size / MESSAGE_LIMIT);
      const chunkSize = Math.ceil(message.length / total);
      for (let chunk = 0; chunk < total; chunk++) {
        connectedGraphs[graph].channel.send(
          JSON.stringify({
            message: message.slice(chunkSize * chunk, chunkSize * (chunk + 1)),
            uuid,
            chunk,
            total,
          })
        );
      }
    },
    getConnectedGraphs: () =>
      Object.keys(connectedGraphs).filter(
        (g) => connectedGraphs[g].status === "CONNECTED"
      ),
    enable: () => {
      if (asyncModeTree.uid) {
        window.roamAlphaAPI.ui.commandPalette.addCommand({
          label: "Setup Multiplayer",
          callback: () => {
            createOverlayRender<Omit<AlertProps, "onClose">>(
              "multiplayer-async",
              AsyncAlert
            )({ messageHandlers });
          },
        });
      } else {
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
      }
      const sibling = document
        .querySelector(`.rm-topbar .rm-sync`)
        .closest(".bp3-popover-wrapper");
      const parent = document.createElement("span");
      parent.id = "roamjs-multiplayer";
      sibling.parentElement.insertBefore(parent, sibling);
      ReactDOM.render(<Multiplayer />, parent);
    },
    disable: () => {
      const parent = document.getElementById("roamjs-multiplayer");
      ReactDOM.unmountComponentAtNode(parent);
      parent.remove();
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

export default Multiplayer;
