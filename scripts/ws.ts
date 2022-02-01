import WebSocket, { WebSocketServer } from "ws";
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
      ondisconnect({ requestContext: { connectionId: ws.url } });
    });
    onconnect({ requestContext: { connectionId: ws.url } });
  });
  wss.on("close", (s: unknown) => {
    console.log("server closing...", s);
  });
});
