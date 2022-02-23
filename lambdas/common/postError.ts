import postToConnection from "./postToConnection";

const postError = (params: {
  event: { requestContext?: { connectionId?: string } };
  Message: string;
}) =>
  postToConnection({
    ConnectionId: params.event?.requestContext?.connectionId || "",
    Data: {
      operation: "ERROR",
      message: params.Message,
    },
  });

export default postError;
