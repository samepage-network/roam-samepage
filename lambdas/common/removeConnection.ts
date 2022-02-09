import AWS from "aws-sdk";
import WebSocket from "ws";
import { removeLocalSocket } from "./postToConnection";

const api = new AWS.ApiGatewayManagementApi();

const removeConnection: (event: {
  requestContext?: { connectionId?: string };
}) => Promise<void> =
  process.env.NODE_ENV === "production"
    ? (event) =>
        api
          .deleteConnection({ ConnectionId: event.requestContext.connectionId })
          .promise()
          .then(() => Promise.resolve())
    : (event) =>
        Promise.resolve(removeLocalSocket(event.requestContext.connectionId));

export default removeConnection;
