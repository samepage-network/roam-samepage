import { WebSocketServer } from "ws";
import {
  addLocalSocket,
  removeLocalSocket,
} from "../lambdas/common/postToConnection";
import { handler as onconnect } from "../lambdas/onconnect";
import { handler as ondisconnect } from "../lambdas/ondisconnect";
import { handler as sendmessage } from "../lambdas/sendmessage";
import {v4} from 'uuid';

const port = Number(process.argv[2]) || 3010;
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const wss = new WebSocketServer({ port }, () => {
  console.log("server started on port:", port);
  wss.on("connection", (ws) => {
    const connectionId = v4();
    console.log("connected new client", connectionId);
    ws.on("message", (data) => {
      sendmessage({
        body: data.toString(),
        requestContext: { connectionId },
      });
    });
    ws.on("close", (s) => {
      console.log("client closing...", s);
      removeLocalSocket(connectionId);
      ondisconnect({ requestContext: { connectionId } });
    });
    addLocalSocket(connectionId, ws);
    onconnect({ requestContext: { connectionId } });
  });
  wss.on("close", (s: unknown) => {
    console.log("server closing...", s);
  });
});
