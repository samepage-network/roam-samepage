import getApi from "./getApi";
import { removeLocalSocket } from "./postToConnection";

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
    ? getApi()
        .deleteConnection({ ConnectionId })
        .promise()
        .then(() => Promise.resolve())
    : Promise.resolve(removeLocalSocket(ConnectionId));
};

export default removeConnection;
