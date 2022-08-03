import createOverlayRender from "roamjs-components/util/createOverlayRender";
import type { Status } from "../types";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, InputGroup, Intent, Label } from "@blueprintjs/core";
import nanoid from "nanoid";
import { render as renderToast } from "roamjs-components/components/Toast";
import { receiveChunkedMessage } from "./setupMessageHandlers";

type AlertProps = { onClose: () => void };

const FAILED_STATES = ["failed", "closed"];

export const connectedGraphs: {
  [graph: string]: {
    connection: RTCPeerConnection;
    channel: RTCDataChannel;
    status: Status;
  };
} = {};

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

const onError = (e: { error: Error } | Event) => {
  if (
    "error" in e &&
    !e.error.message.includes("Transport channel closed") &&
    !e.error.message.includes("User-Initiated Abort, reason=Close called")
  ) {
    // handled in disconnect
    console.error(e);
    renderToast({
      id: "samepage-p2p-error",
      content: `SamePage Error: ${e.error}`,
      intent: "danger",
    });
  }
};

const isSafari =
  window.navigator.userAgent.includes("Safari") &&
  !window.navigator.userAgent.includes("Chrome") &&
  !window.navigator.userAgent.includes("Android");

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
        id: "samepage-failed-connection",
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
    id: `samepage-on-connect`,
    content: `Successfully connected to graph: ${name}!`,
  });
  callback();
  connectedGraphs[name] = {
    connection,
    channel,
    status: "CONNECTED",
  };
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

const onDisconnect = (graph: string) => () => {
  if (connectedGraphs[graph].status !== "DISCONNECTED") {
    renderToast({
      id: "samepage-disconnect",
      content: `Disconnected from graph ${graph}`,
      intent: "warning",
    });
    connectedGraphs[graph].status = "DISCONNECTED";
  }
};

export const getSetupCode = ({
  onClose,
  label = nanoid(),
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
    sendChannel.send(window.roamAlphaAPI.graph.name);
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

export const getConnectCode = ({
  offer,
  onClose,
  label = nanoid(),
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
    const connectionHandler = (e: MessageEvent) => {
      onConnect({
        e,
        connection,
        channel: receiveChannel,
        callback: () => {
          delete connectedGraphs[label];
          cleanup();
          receiveChannel.send(window.roamAlphaAPI.graph.name);
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

export const receiveAnswer = ({ answer }: { answer: string }) => {
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
      title={"Setup Connection"}
      isCloseButtonShown={false}
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
      title={"Connect to Host"}
      isCloseButtonShown={false}
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

export const load = () => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Setup Direct SamePage Connection",
    callback: () => {
      createOverlayRender<Omit<AlertProps, "onClose">>(
        "samepage-p2p-setup",
        SetupAlert
      )({});
    },
  });
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Connect To SamePage Instance",
    callback: () => {
      createOverlayRender<Omit<AlertProps, "onClose">>(
        "samepage-p2p-connect",
        ConnectAlert
      )({});
    },
  });
};
export const unload = () => {
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Connect To SamePage Instance",
  });
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Setup Direct SamePage Connection",
  });
};
