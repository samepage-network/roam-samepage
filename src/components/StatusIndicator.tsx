import type { Status } from "./setupMultiplayer";
import { Tooltip } from "@blueprintjs/core";

const StatusIndicator = ({ status }: { status: Status }) => (
  <Tooltip content={status} className="roamjs-multiplayer-status-indicator">
    <div
      style={{
        width: 12,
        height: 12,
        background:
        status === "CONNECTED"
            ? "#0F9960"
            : status === "PENDING"
            ? "#d9822b"
            : "#99280f",
        borderRadius: 6,
      }}
    />
  </Tooltip>
);

export default StatusIndicator;
