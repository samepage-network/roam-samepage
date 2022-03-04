import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  connectedGraphs,
  ONLINE_GRAPHS_ID,
} from "./setupMultiplayer";
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
  useEffect(() => {
    containerRef.current.addEventListener("roamjs:multiplayer:graphs", () => {
      setGraphs(refreshGraphs());
    });
  }, [setGraphs, containerRef, refreshGraphs]);
  return (
    <div
      style={{ padding: 16, width: 240 }}
      id={ONLINE_GRAPHS_ID}
      ref={containerRef}
    >
      {Object.keys(graphs).length ? (
        <ul style={{ padding: 0, margin: 0 }}>
          {Object.keys(graphs).map((g) => (
            <li
              key={g}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{g}</span>{" "}
              <StatusIndicator status={graphs[g]}/>
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
