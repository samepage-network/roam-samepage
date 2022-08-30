import setupSamePageClient from "@samepage/client/protocols/setupSamePageClient";
import { onAppEvent } from "@samepage/client/internal/registerAppEventListener";
import runExtension from "roamjs-components/util/runExtension";
import { render as renderToast } from "roamjs-components/components/Toast";
import { renderLoading } from "roamjs-components/components/Loading";
import renderOverlay from "roamjs-components/util/renderOverlay";
import addStyle from "roamjs-components/dom/addStyle";
import setupSharePageWithNotebook from "./messages/sharePageWithNotebook";
import loadSendPageToGraph from "./messages/sendPageToGraph";
import loadCopyBlockToGraph from "./messages/copyBlockToGraph";
import loadCrossGraphBlockReference from "./messages/crossGraphBlockReference";
import UsageChart from "./components/UsageChart";

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
    addStyle(
      `div.samepage-notification-container { top: 40px; bottom: unset; }`
    );

    let removeLoadingCallback: () => void;
    const {
      unload: unloadSamePageClient,
      ...api
    } = await setupSamePageClient({
      isAutoConnect: extensionAPI.settings.get("auto-connect") as boolean,
      addCommand: window.roamAlphaAPI.ui.commandPalette.addCommand,
      removeCommand: window.roamAlphaAPI.ui.commandPalette.removeCommand,
      app: 1,
      workspace: window.roamAlphaAPI.graph.name,
    });
    onAppEvent("log", (evt) =>
      renderToast({
        id: evt.id,
        content: evt.content,
        intent:
          evt.intent === "error"
            ? "danger"
            : evt.intent === "info"
            ? "primary"
            : evt.intent,
      })
    );
    onAppEvent("usage", (evt) =>
      renderOverlay({ Overlay: UsageChart, props: evt })
    );
    onAppEvent("connection", (evt) => {
      if (evt.status === "PENDING") removeLoadingCallback = renderLoading();
      else removeLoadingCallback?.();
    });
    const unloadSharePageWithNotebook = setupSharePageWithNotebook();

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
