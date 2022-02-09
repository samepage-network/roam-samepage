import AWS from "aws-sdk";
import WebSocket from "ws";

const api = new AWS.ApiGatewayManagementApi();
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

const postToConnection: (params: {
  ConnectionId: string;
  Data: string;
}) => Promise<void> =
  process.env.NODE_ENV === "production"
    ? (params) =>
        api
          .postToConnection(params)
          .promise()
          .then(() => Promise.resolve())
    : (params) => {
        const connection = localSockets[params.ConnectionId];
        if (connection) return Promise.resolve(connection.send(params.Data));
        else return Promise.reject(`No connection of id ${params.ConnectionId}`);
      };

export default postToConnection;
