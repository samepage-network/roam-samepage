import { JSONData } from "samepage/internal/types";
import setupSamePageClient from "samepage/protocols/setupSamePageClient";
import WebSocket from "ws";
// @ts-ignore
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
  const settings = {
    token,
    uuid,
  };
  const { sendNotebookRequest, unload, listNotebooks } = setupSamePageClient({
    renderOverlay: () => () => {},
    getSetting: (s) => settings[s],
    app: "roam",
  });
  const targetUuid = await listNotebooks().then(({ notebooks }) => {
    const uuidsByName = Object.fromEntries(
      notebooks.map((n) => [`${n.appName} ${n.workspace}`, n.uuid])
    );
    return uuidsByName[target];
  });
  const responseData = await sendNotebookRequest({
    label,
    target: targetUuid,
    request,
  });
  unload();
  return responseData;
};

export default backendCrossNotebookRequest;
