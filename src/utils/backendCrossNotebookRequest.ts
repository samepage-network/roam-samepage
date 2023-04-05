import setupSamePageClient from "samepage/protocols/setupSamePageClient";
import WebSocket from "ws";
// @ts-ignore
global.WebSocket = WebSocket;

const backendCrossNotebookRequest = async <T>({
  authorization,
  label,
  targets,
  request,
}: {
  authorization: string;
  label: string;
  targets: string[];
  request: Record<string, unknown>;
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
  const targetUuids = await listNotebooks().then(({ notebooks }) => {
    const uuidsByName = Object.fromEntries(
      notebooks.map((n) => [`${n.appName} ${n.workspace}`, n.uuid])
    );
    return targets.map((t) => uuidsByName[t]);
  });
  const responseData = await new Promise<Record<string, T>>((resolve) => {
    let responses = 0;
    let noResponseTimeout = setTimeout(() => {
      console.log("nobody", responseData);
      resolve({});
    }, 3000);
    sendNotebookRequest({
      label,
      targets: targetUuids,
      request,
      onResponse: (data) => {
        const responseData = data as Record<string, T>;
        if (responses === 0) {
          clearTimeout(noResponseTimeout);
          if (
            Object.values(responseData).some(
              (r) => (r as T | "rejected") !== "rejected"
            )
          ) {
            noResponseTimeout = setTimeout(() => {
              resolve(responseData);
            }, 2500);
          } else {
            resolve(responseData);
          }
        } else if (responses === 1) {
          clearTimeout(noResponseTimeout);
          resolve(responseData);
        }
        responses++;
      },
    });
  });
  unload();
  return responseData;
};

export default backendCrossNotebookRequest;
