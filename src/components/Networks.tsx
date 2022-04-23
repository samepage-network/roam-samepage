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
  messageHandlers,
  roamJsBackend,
  ONLINE_GRAPHS_ID,
} from "./setupMultiplayer";
import renderToast from "roamjs-components/components/Toast";
import StatusIndicator from "./StatusIndicator";
import apiPost from "roamjs-components/util/apiPost";
import getGraph from "roamjs-components/util/getGraph";

const Network = (r: {
  id: string;
  setError: (s: string) => void;
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
                  apiPost(`multiplayer`, {
                    method: "leave-network",
                    graph: getGraph(),
                    name: r.id,
                  })
                    .then(() => {
                      r.onDelete(r.id);
                      renderToast({
                        id: "network-success",
                        content: `Successfully left network ${r.id}`,
                        intent: Intent.SUCCESS,
                      });
                    })
                    .catch((e) => r.setError(e.message))
                    .finally(() => setLoading(false));
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
  const onDelete = useCallback(
    (i: string) => {
      setNetworks(networks.filter((n) => n.id !== i));
    },
    [networks, setNetworks]
  );
  const [status, setStatus] = useState(roamJsBackend.status);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    containerRef.current.addEventListener("roamjs:multiplayer:graphs", () => {
      setStatus(roamJsBackend.status);
    });

    apiPost(`multiplayer`, {
      method: "list-networks",
      graph: getGraph(),
    })
      .then((r) => setNetworks(r.data.networks.map((id: string) => ({ id }))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => clearTimeout(errorTimeout.current);
  }, [setLoading, setNetworks, setError, setStatus]);
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
                setError={setError}
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
              apiPost(`multiplayer`, {
                method: "create-network",
                graph: getGraph(),
                name: newNetwork,
                password,
              })
                .then(() => {
                  setNetworks([...networks, { id: newNetwork }]);
                  setNewNetwork("");
                  setPassword("");
                  renderToast({
                    content: `Successfully created network ${newNetwork}!`,
                    id: "network-success",
                    intent: Intent.SUCCESS,
                  });
                })
                .catch((e) => e.setError(e.message))
                .finally(() => setLoading(false));
            }}
          />
          <Button
            text={"JOIN"}
            onClick={() => {
              setLoading(true);
              apiPost(`multiplayer`, {
                method: "join-network",
                graph: getGraph(),
                name: newNetwork,
                password,
              })
                .then(() => {
                  setNetworks([...networks, { id: newNetwork }]);
                  setNewNetwork("");
                  setPassword("");
                  renderToast({
                    content: `Successfully joined network ${newNetwork}!`,
                    id: "network-success",
                    intent: Intent.SUCCESS,
                  });
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
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
