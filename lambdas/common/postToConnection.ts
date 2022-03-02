import { v4 } from "uuid";
import WebSocket from "ws";
import { endClient } from "../ondisconnect";
import getApi from "./getApi";

const localSockets: Record<string, WebSocket> = {};

export const addLocalSocket = (id: string, ws: WebSocket) =>
  (localSockets[id] = ws);

export const removeLocalSocket = (id: string) => {
  if (
    localSockets[id]?.readyState === WebSocket.OPEN ||
    localSockets[id]?.readyState === WebSocket.CONNECTING
  ) {
    localSockets[id].close();
  }
  delete localSockets[id];
};

type SendData = {
  ConnectionId: string;
  Data: Record<string, unknown>;
};

const MESSAGE_LIMIT = 15750; // 16KB minus 250b buffer for metadata

const getSender = (ConnectionId: string) => {
  if (process.env.NODE_ENV === "production") {
    const api = getApi();
    return (params: string) =>
      api
        .postToConnection({ ConnectionId, Data: params })
        .promise()
        .then(() => Promise.resolve());
  } else {
    const connection = localSockets[ConnectionId];
    return (params: string) => {
      if (connection) return Promise.resolve(connection.send(params));
      else endClient(ConnectionId, "Missed Message");
    };
  }
};

const postToConnection: (params: SendData) => Promise<void> = (params) => {
  const fullMessage = JSON.stringify(params.Data);
  const uuid = v4();
  const size = Buffer.from(fullMessage).length;
  const total = Math.ceil(size / MESSAGE_LIMIT);
  const chunkSize = Math.ceil(fullMessage.length / total);
  const sender = getSender(params.ConnectionId);
  return Promise.all(
    Array(total)
      .fill(null)
      .map((_, chunk) => {
        const message = fullMessage.slice(
          chunkSize * chunk,
          chunkSize * (chunk + 1)
        );
        sender(
          JSON.stringify({
            message,
            uuid,
            chunk,
            total,
          })
        );
      })
  ).then(() => Promise.resolve());
};

export default postToConnection;
