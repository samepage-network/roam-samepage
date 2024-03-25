import listNotebooks from "samepage/utils/listNotebooks";
import setupRegistry from "samepage/internal/registry";
import type { JSONData, NotebookResponse } from "samepage/internal/types";
import setupCrossNotebookRequests from "samepage/protocols/crossNotebookRequests";
import WebSocket from "ws";
import apiClient from "samepage/internal/apiClient";
import downloadResponse from "samepage/backend/downloadResponse";
import ServerError from "samepage/backend/ServerError";
// @ts-ignore - TODO enable a lighter weight samepage client that doesn't require a websocket
global.WebSocket = WebSocket;

const NUM_RETRIES = 5;
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
  setupRegistry({
    getSetting: (s) => settings[s],
    app: "roam",
  });
  const { unload } = setupCrossNotebookRequests();
  const targetUuid = await listNotebooks().then(({ notebooks }) => {
    const uuidsByName = Object.fromEntries(
      notebooks.map((n) => [`${n.appName} ${n.workspace}`, n.uuid])
    );
    return uuidsByName[target];
  });

  const responseData = await apiClient<{
    response: NotebookResponse;
    requestUuid: string;
    cacheHit: boolean;
    messageUuid: string;
  }>({
    method: "notebook-request",
    target: targetUuid,
    request,
    label,
  })
    .then(
      async (r) =>
        new Promise<NotebookResponse>(async (resolve, reject) => {
          if (r.cacheHit || r.response === "pending" || r.response === null) {
            const promises = Array(NUM_RETRIES)
              .fill(null)
              .map(() => () => downloadResponse(r.messageUuid));
            const directResponse = await promises.reduce((prev, cur, index) => {
              return prev.then((value) => {
                if (value) return value;
                else
                  return new Promise((inner) =>
                    setTimeout(() => inner(cur()), 500)
                  );
              });
            }, Promise.resolve(""));
            if (directResponse) resolve(JSON.parse(directResponse));
            else {
              resolve(r.response);
            }
          } else if (r.response === "rejected") {
            reject(
              new Error(`Request "${label}" was rejected by target notebook.`)
            );
          } else {
            resolve(r.response);
          }
        })
    )
    .catch((e) => {
      throw new ServerError(e.message, 405);
    });
  unload();
  return responseData;
};

export default backendCrossNotebookRequest;
