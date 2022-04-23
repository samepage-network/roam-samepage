import React, { useEffect, useState } from "react";
import { Spinner } from "@blueprintjs/core";
import apiPost from "roamjs-components/util/apiPost";
import getGraph from "roamjs-components/util/getGraph";

const UsageChart = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ networks: 0, minutes: 0, messages: 0, date: '' });
  useEffect(() => {
    apiPost("multiplayer", { method: "usage", graph: getGraph() })
      .then((r) => setStats(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [setStats, setLoading, setError]);
  return (
    <div>
      <div style={loading ? { opacity: 0.5 } : {}}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <b>Description</b>
          <span>
            <b style={{ minWidth: 80, display: "inline-block" }}>Price</b>
            <b style={{ minWidth: 80, display: "inline-block" }}>Qty</b>
            <b style={{ minWidth: 80, display: "inline-block" }}>Total</b>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Minutes Connected to RoamJS</span>
          <span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              $0.002
            </span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              {stats.minutes.toFixed(2)}
            </span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              ${(stats.minutes * 0.002).toFixed(2)}
            </span>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Messages Sent</span>
          <span>
            <span style={{ minWidth: 80, display: "inline-block" }}>$0.01</span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              {stats.messages.toFixed(2)}
            </span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              ${(stats.messages * 0.01).toFixed(2)}
            </span>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Networks Owned</span>
          <span>
            <span style={{ minWidth: 80, display: "inline-block" }}>$1</span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              {stats.networks}
            </span>
            <span style={{ minWidth: 80, display: "inline-block" }}>
              ${stats.networks.toFixed(2)}
            </span>
          </span>
        </div>
        <hr />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span><b>Total</b> {stats.date && `(Billed: ${stats.date})`}</span>
          <span style={{ display: "flex", alignItems: "center" }}>
            <span style={{ minWidth: 160 }}>
              {loading && <Spinner size={16} />}
            </span>
            <b style={{ minWidth: 80, display: "inline-block" }}>
              $
              {(
                stats.minutes * 0.002 +
                stats.messages * 0.01 +
                stats.networks
              ).toFixed(2)}
            </b>
          </span>
        </div>
      </div>
      <div style={{ color: "darkred" }}>{error}</div>
    </div>
  );
};

export default UsageChart;
