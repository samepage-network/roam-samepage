import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  connectedGraphs,
  ONLINE_GRAPHS_ID,
  ONLINE_UPDATE_EVENT_NAME,
  roamJsBackend,
} from "./setupSamePageClient";
import StatusIndicator from "./StatusIndicator";

const OnlineGraphs = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshGraphs = useCallback(() => {
    return Object.fromEntries(
      (window.roamjs.extension.multiplayer?.getNetworkedGraphs() || []).map(
        (s) => [s, connectedGraphs[s]?.status || "DISCONNECTED"]
      )
    );
  }, []);
  const [graphs, setGraphs] = useState(refreshGraphs);
  const [status, setStatus] = useState(roamJsBackend.status);
  useEffect(() => {
    containerRef.current.addEventListener(ONLINE_UPDATE_EVENT_NAME, () => {
      setGraphs(refreshGraphs());
      setStatus(roamJsBackend.status);
    });
  }, [setGraphs, containerRef, refreshGraphs, setStatus]);
  return (
    <div
      style={{ padding: 16, width: 240 }}
      id={ONLINE_GRAPHS_ID}
      ref={containerRef}
    >
      {Object.keys(graphs).length ? (
        <ul style={{ padding: 0, margin: 0 }}>
          <li className="flex items-center justify-between">
            <span>{window.roamAlphaAPI.graph.name}</span>
            <StatusIndicator status={status} />
          </li>
          {Object.keys(graphs).map((g) => (
            <li key={g} className="flex items-center justify-between">
              <span>{g}</span> <StatusIndicator status={graphs[g]} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No Graphs Connected</p>
      )}
    </div>
  );
};

export default OnlineGraphs;
