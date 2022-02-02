import AWS from "aws-sdk";
import WebSocket from "ws";

const api = new AWS.ApiGatewayManagementApi();
const localSockets: Record<string, WebSocket> = {};

export const addLocalSocket = (id: string, ws: WebSocket) => (localSockets[id] = ws);

export const removeLocalSocket = (id: string) => delete localSockets[id];

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
    : (params) =>
        Promise.resolve(localSockets[params.ConnectionId].send(params.Data));

export default postToConnection;
