import { WebSocketServer } from "ws";
import {
  addLocalSocket,
  removeLocalSocket,
} from "../lambdas/common/postToConnection";
import { handler as onconnect } from "../lambdas/onconnect";
import { handler as ondisconnect } from "../lambdas/ondisconnect";
import { handler as sendmessage } from "../lambdas/sendmessage";

const port = Number(process.argv[2]) || 3010;

const wss = new WebSocketServer({ port }, () => {
  console.log("server started");
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      sendmessage({ body: data.toString() });
    });
    ws.on("close", (s) => {
      console.log("client closing...", s);
      removeLocalSocket(ws.url);
      ondisconnect({ requestContext: { connectionId: ws.url } });
    });
    addLocalSocket(ws.url, ws);
    onconnect({ requestContext: { connectionId: ws.url } });
  });
  wss.on("close", (s: unknown) => {
    console.log("server closing...", s);
  });
});
