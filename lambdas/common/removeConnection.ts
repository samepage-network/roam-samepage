import AWS from "aws-sdk";
import { removeLocalSocket } from "./postToConnection";

const api = new AWS.ApiGatewayManagementApi();

const removeConnection = (
  event:
    | {
        requestContext?: { connectionId?: string };
      }
    | string
): Promise<void> => {
  const ConnectionId =
    typeof event === "string" ? event : event.requestContext.connectionId;
  return process.env.NODE_ENV === "production"
    ? api
        .deleteConnection({ ConnectionId })
        .promise()
        .then(() => Promise.resolve())
    : Promise.resolve(removeLocalSocket(ConnectionId));
};

export default removeConnection;
