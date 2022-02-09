import React, { useEffect, useRef, useState } from "react";
import { connectedGraphs, ONLINE_GRAPHS_ID } from "./setupMultiplayer";

const OnlineGraphs = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphs, setGraphs] = useState({...connectedGraphs});
  useEffect(() => {
    containerRef.current.addEventListener("roamjs:multiplayer:graphs", () => {
      setGraphs({...connectedGraphs});
    });
  }, [setGraphs, containerRef]);
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
              <div
                style={{
                  width: 12,
                  height: 12,
                  background:
                    graphs[g]?.status === "CONNECTED"
                      ? "#0F9960"
                      : graphs[g]?.status === "PENDING"
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
  );
};

export default OnlineGraphs;
