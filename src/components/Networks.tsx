import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  InputGroup,
  Intent,
  Label,
  Spinner,
  Tooltip,
} from "@blueprintjs/core";
import {
  sendToBackend,
  messageHandlers,
  roamJsBackend,
  ONLINE_GRAPHS_ID,
} from "./setupMultiplayer";
import renderToast from "roamjs-components/components/Toast";
import StatusIndicator from "./StatusIndicator";

const Network = (r: {
  id: string;
  setupOnError: () => void;
  onDelete: (id: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <li className="roamjs-multiplayer-connected-network">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            flexGrow: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{r.id}</span>
          <span
            style={{
              display: "inline-flex",
              minWidth: "100px",
              justifyContent: "end",
              alignItems: "center",
            }}
          >
            {loading && <Spinner size={16} />}
            <Tooltip content={"Leave Network"}>
              <Button
                icon={"trash"}
                minimal
                onClick={() => {
                  setLoading(true);
                  r.setupOnError();
                  const response = `LEAVE_NETWORK_SUCCESS/${r.id}`;
                  messageHandlers[response] = () => {
                    delete messageHandlers[response];
                    r.onDelete(r.id);
                    setLoading(false);
                    renderToast({
                      content: `Successfully left network ${r.id}`,
                      id: "network-success",
                    });
                  };
                  sendToBackend({
                    operation: "LEAVE_NETWORK",
                    data: { name: r.id },
                  });
                }}
              />
            </Tooltip>
          </span>
        </span>
      </div>
    </li>
  );
};

const Networks = () => {
  const [loading, setLoading] = useState(true);
  const [networks, setNetworks] = useState<{ id: string }[]>([]);
  const [newNetwork, setNewNetwork] = useState("");
  const [password, setPassword] = useState("");
  const errorTimeout = useRef(0);
  const [error, setError] = useState("");
  const setupOnError = useCallback(() => {
    setError("");
    const oldOnError = messageHandlers["ERROR"];
    messageHandlers["ERROR"] = (d, g) => {
      oldOnError(d, g);
      setLoading(false);
      messageHandlers["ERROR"] = oldOnError;
    };
  }, [setLoading, setError]);
  const onDelete = useCallback(
    (i: string) => {
      setNetworks(networks.filter((n) => n.id !== i));
    },
    [networks, setNetworks]
  );
  const [status, setStatus] = useState(roamJsBackend.status);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setupOnError();
    messageHandlers["LIST_NETWORKS"] = (data: {
      networks: typeof networks;
    }) => {
      clearTimeout(errorTimeout.current);
      setError("");
      setLoading(false);
      setNetworks(data.networks);
      delete messageHandlers["LIST_NETWORKS"];
    };
    sendToBackend({ operation: "LIST_NETWORKS" });
    errorTimeout.current = window.setTimeout(() => {
      setError(
        "Timed out waiting to list networks. Navigate away from this page and return to refresh"
      );
      setLoading(false);
    }, 10000);
    containerRef.current.addEventListener("roamjs:multiplayer:graphs", () => {
      setStatus(roamJsBackend.status);
    });
    return () => clearTimeout(errorTimeout.current);
  }, [
    setLoading,
    setNetworks,
    setupOnError,
    errorTimeout,
    setError,
    containerRef,
    setStatus,
  ]);
  return (
    <>
      <div style={{ height: 120, position: "relative" }}>
        {loading ? (
          <Spinner />
        ) : networks.length ? (
          <ul>
            {networks.map((r) => (
              <Network
                key={r.id}
                {...r}
                setupOnError={setupOnError}
                onDelete={onDelete}
              />
            ))}
          </ul>
        ) : (
          <p>Graph is not a member of any networks</p>
        )}
        <p style={{ color: "darkred" }}>{error}</p>
      </div>
      <div
        id={ONLINE_GRAPHS_ID}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        ref={containerRef}
      >
        <StatusIndicator status={status} />
        <Label>
          Network Name
          <InputGroup
            value={newNetwork}
            onChange={(e) => setNewNetwork(e.target.value)}
            disabled={loading}
            placeholder="New Network"
          />
        </Label>
        <Label style={{ marginLeft: 8 }}>
          Password
          <InputGroup
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder="************"
            type={"password"}
          />
        </Label>
        <div
          style={{
            display: "flex",
            minWidth: 160,
          }}
        >
          <Button
            intent={Intent.PRIMARY}
            disabled={!newNetwork || !password || loading}
            text={"CREATE"}
            style={{ margin: "0 16px" }}
            onClick={() => {
              setLoading(true);
              setupOnError();
              const response = `CREATE_NETWORK_SUCCESS/${newNetwork}`;
              messageHandlers[response] = () => {
                delete messageHandlers[response];
                setNetworks([...networks, { id: newNetwork }]);
                setLoading(false);
                setNewNetwork("");
                setPassword("");
                renderToast({
                  content: `Successfully created network ${newNetwork}!`,
                  id: "network-success",
                  intent: Intent.SUCCESS,
                });
              };
              sendToBackend({
                operation: "CREATE_NETWORK",
                data: { name: newNetwork, password },
              });
            }}
          />
          <Button
            text={"JOIN"}
            onClick={() => {
              setLoading(true);
              setupOnError();
              const response = `JOIN_NETWORK_SUCCESS/${newNetwork}`;
              messageHandlers[response] = () => {
                delete messageHandlers[response];
                setNetworks([...networks, { id: newNetwork }]);
                setLoading(false);
                setNewNetwork("");
                setPassword("");
              };
              sendToBackend({
                operation: "JOIN_NETWORK",
                data: { name: newNetwork, password },
              });
            }}
            disabled={!newNetwork || !password || loading}
            intent={Intent.SUCCESS}
          />
        </div>
      </div>
    </>
  );
};

export default Networks;
