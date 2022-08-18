import runExtension from "roamjs-components/util/runExtension";
import loadSendPageToGraph from "./messages/sendPageToGraph";
import loadCopyBlockToGraph from "./messages/copyBlockToGraph";
import loadCrossGraphBlockReference from "./messages/crossGraphBlockReference";
import { setupSamePageClient } from "@samepage/client";
import { render as renderToast } from "roamjs-components/components/Toast";
import UsageChart from "./components/UsageChart";
import { notify } from "./components/NotificationContainer";
import setupSharePageWithNotebook, {
  notebookDbIds,
  STATUS_EVENT_NAME,
} from "./messages/sharePageWithNotebook";
import { renderLoading } from "roamjs-components/components/Loading";
import renderOverlay from "roamjs-components/util/renderOverlay";

const extensionId = process.env.ROAMJS_EXTENSION_ID;

let unload;

export default runExtension({
  // migratedTo: "SamePage", // query github
  extensionId,
  run: async ({ extensionAPI }) => {
    extensionAPI.settings.panel.create({
      tabTitle: "SamePage",
      settings: [
        {
          id: "auto-connect",
          name: "Auto Connect",
          action: {
            type: "switch",
          },
          description: "Automatically connect to the SamePage Network",
        },
      ],
    });

    let removeLoadingCallback: () => void;
    const {
      unload: unloadSamePageClient,
      apps: appArray,
      ...api
    } = await setupSamePageClient({
      isAutoConnect: extensionAPI.settings.get("auto-connect") as boolean,
      addCommand: window.roamAlphaAPI.ui.commandPalette.addCommand,
      removeCommand: window.roamAlphaAPI.ui.commandPalette.removeCommand,
      app: 1,
      workspace: window.roamAlphaAPI.graph.name,
      onAppEventHandler: (evt) => {
        if (evt.type === "log") {
          renderToast({
            id: evt.id,
            content: evt.content,
            intent:
              evt.intent === "error"
                ? "danger"
                : evt.intent === "info"
                ? "primary"
                : evt.intent,
          });
        } else if (evt.type === "init-page") {
          const id = window.roamAlphaAPI.pull("[:db/id]", [
            ":block/uid",
            evt.notebookPageId,
          ])?.[":db/id"];
          if (id) {
            notebookDbIds.add(id);
          }
          document.body.dispatchEvent(
            new CustomEvent(STATUS_EVENT_NAME, { detail: evt.notebookPageId })
          );
        } else if (evt.type === "share-page") {
          const app = appArray.find((a) => a.id === evt.source.app)?.name;
          const args = {
            workspace: evt.source.workspace,
            app: `${evt.source.app}`,
            pageUuid: evt.pageUuid,
          };
          notify({
            title: "Share Page",
            description: `Notebook ${app}/${evt.source.workspace} is attempting to share page ${evt.notebookPageId}. Would you like to accept?`,
            actions: [
              {
                label: "accept",
                method: "accept",
                args,
              },
              {
                label: "reject",
                method: "reject",
                args,
              },
            ],
          });
        } else if (evt.type === "usage") {
          renderOverlay({ Overlay: UsageChart, props: evt });
        } else if (evt.type === "connection") {
          if (evt.status === "PENDING") removeLoadingCallback = renderLoading();
          else removeLoadingCallback?.();
        }
      },
    });
    const apps = Object.fromEntries(
      appArray.map(({ id, ...app }) => [id, app])
    );
    const unloadSharePageWithNotebook = setupSharePageWithNotebook(apps);

    const unloadCopyBlockToGraph = loadCopyBlockToGraph(api);
    const unloadCrossGraphBlockReference = loadCrossGraphBlockReference(api);
    const unloadSendPageToGraph = loadSendPageToGraph(api);

    window.roamjs.extension[process.env.ROAMJS_EXTENSION_ID] = window.samepage;
    unload = () => {
      unloadSendPageToGraph();
      unloadCopyBlockToGraph();
      unloadCrossGraphBlockReference();

      unloadSharePageWithNotebook();
      unloadSamePageClient();
    };
  },
  unload,
});
