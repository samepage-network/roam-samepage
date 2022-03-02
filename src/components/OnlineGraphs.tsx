import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Tooltip } from "@blueprintjs/core";
import {
  connectedGraphs,
  ONLINE_GRAPHS_ID,
  roamJsBackend,
} from "./setupMultiplayer";

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
              <Tooltip content={graphs[g]}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    background:
                      graphs[g] === "CONNECTED"
                        ? "#0F9960"
                        : graphs[g] === "PENDING"
                        ? "#d9822b"
                        : "#99280f",
                    borderRadius: 6,
                  }}
                />
              </Tooltip>
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
