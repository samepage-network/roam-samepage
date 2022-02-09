import React from "react";
import { connectedGraphs } from "./setupMultiplayer";

const OnlineGraphs = () => {
  return (
    <div style={{ padding: 16, width: 240 }}>
      {Object.keys(connectedGraphs).length ? (
        <ul style={{ padding: 0, margin: 0 }}>
          {Object.keys(connectedGraphs).map((g) => (
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
                    connectedGraphs[g]?.status === "CONNECTED"
                      ? "#0F9960"
                      : connectedGraphs[g]?.status === "PENDING"
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
