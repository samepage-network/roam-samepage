import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  InputGroup,
  Intent,
  Label,
  Spinner,
  Tooltip,
} from "@blueprintjs/core";
import renderToast from "roamjs-components/components/Toast";
import apiPost from "roamjs-components/util/apiPost";
import apiClient from "../apiClient";

const Network = (r: {
  id: string;
  setError: (s: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <li className="roamjs-samepage-connected-network">
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
                    graph: window.roamAlphaAPI.graph.name,
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
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    apiPost<{ networks: string[] }>(`multiplayer`, {
      method: "list-networks",
      graph: window.roamAlphaAPI.graph.name,
    })
      .then((r) => setNetworks(r.networks.map((id: string) => ({ id }))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => clearTimeout(errorTimeout.current);
  }, [setLoading, setNetworks, setError]);
  return (
    <div>
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
        <p
          className={
            "overflow-hidden text-overflow-ellipsis white-space-nowrap text-red-700"
          }
        >
          {error}
        </p>
      </div>
      <div className="flex items-center justify-between" ref={containerRef}>
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
      </div>
      <div
        className={"gap-4 flex mt-4"}
        style={{
          minWidth: 160,
        }}
      >
        <Button
          intent={Intent.PRIMARY}
          disabled={!newNetwork || !password || loading}
          text={"CREATE"}
          onClick={() => {
            setLoading(true);
            setError("");
            apiPost(`multiplayer`, {
              method: "create-network",
              graph: window.roamAlphaAPI.graph.name,
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
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false));
          }}
        />
        <Button
          text={"JOIN"}
          onClick={() => {
            setLoading(true);
            setError("");
            apiPost(`multiplayer`, {
              method: "join-network",
              graph: window.roamAlphaAPI.graph.name,
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
  );
};

export default Networks;
