import listNotebooks from "samepage/utils/listNotebooks";
import setupRegistry from "samepage/internal/registry";
import type { JSONData } from "samepage/internal/types";
import setupCrossNotebookRequests from "samepage/protocols/crossNotebookRequests";
import WebSocket from "ws";
// @ts-ignore - TODO enable a lighter weight samepage client that doesn't require a websocket
global.WebSocket = WebSocket;

const backendCrossNotebookRequest = async <T>({
  authorization,
  label,
  target,
  request,
}: {
  authorization: string;
  label: string;
  target: string;
  request: JSONData;
}) => {
  const [uuid, token] = Buffer.from(
    authorization.replace(/^Basic /, ""),
    "base64"
  )
    .toString()
    .split(":");

  // START OF SETUP
  // TODO - simplify this setup to import methods directly from package.
  // Don't need a full client with websocket
  const settings = {
    token,
    uuid,
  };
  setupRegistry({
    getSetting: (s) => settings[s],
    app: "roam",
  });
  const { sendNotebookRequest, unload } = setupCrossNotebookRequests();
  const targetUuid = await listNotebooks().then(({ notebooks }) => {
    const uuidsByName = Object.fromEntries(
      notebooks.map((n) => [`${n.appName} ${n.workspace}`, n.uuid])
    );
    return uuidsByName[target];
  });
  // END OF SETUP

  const responseData = await sendNotebookRequest({
    label,
    target: targetUuid,
    request,
  });
  unload();
  return responseData;
};

export default backendCrossNotebookRequest;
