import React, { useCallback, useEffect, useState } from "react";
import { Button, InputGroup, Intent, Spinner } from "@blueprintjs/core";
import { sendToBackend, messageHandlers } from "./setupMultiplayer";

const Network = (r: { id: string }) => {
  const [loading] = useState(false);
  return (
    <li>
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
          {loading && <Spinner />}
        </span>
      </div>
    </li>
  );
};

const Networks = () => {
  const [loading, setLoading] = useState(true);
  const [networks, setNetworks] = useState<{ id: string }[]>([]);
  const [newNetwork, setNewNetwork] = useState("");
  const setupOnError = useCallback(() => {
    const oldOnError = messageHandlers["ERROR"];
    messageHandlers["ERROR"] = (d, g) => {
      oldOnError(d, g);
      setLoading(false);
      messageHandlers["ERROR"] = oldOnError;
    };
  }, [setLoading]);
  useEffect(() => {
    setupOnError();
    messageHandlers["LIST_NETWORKS"] = (data: {
      networks: typeof networks;
    }) => {
      setLoading(false);
      setNetworks(data.networks);
      delete messageHandlers["LIST_NETWORKS"];
    };
    sendToBackend({ operation: "LIST_NETWORKS" });
  }, [setLoading, setNetworks, setupOnError]);
  return (
    <>
      <div style={{ height: 120 }}>
        {loading ? (
          <Spinner />
        ) : networks.length ? (
          <ul>
            {networks.map((r) => (
              <Network key={r.id} {...r} />
            ))}
          </ul>
        ) : (
          <p>Graph is not a member of any networks</p>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <InputGroup
          value={newNetwork}
          onChange={(e) => setNewNetwork(e.target.value)}
          disabled={loading}
          placeholder="New Network"
        />
        <div>
          <Button
            intent={Intent.PRIMARY}
            disabled={!newNetwork}
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
              };
              sendToBackend({
                operation: "CREATE_NETWORK",
                data: { name: newNetwork },
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
              };
              sendToBackend({
                operation: "JOIN_NETWORK",
                data: { name: newNetwork },
              });
            }}
            disabled={!newNetwork}
            intent={Intent.SUCCESS}
          />
        </div>
      </div>
    </>
  );
};

export default Networks;
