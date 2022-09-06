import setupSamePageClient from "samepage/protocols/setupSamePageClient";
import defaultSettings from "samepage/utils/defaultSettings";
import { onAppEvent } from "samepage/internal/registerAppEventListener";
import runExtension from "roamjs-components/util/runExtension";
import { render as renderToast } from "roamjs-components/components/Toast";
import { renderLoading } from "roamjs-components/components/Loading";
import renderOverlay from "roamjs-components/util/renderOverlay";
import addStyle from "roamjs-components/dom/addStyle";
import setupSharePageWithNotebook from "./messages/sharePageWithNotebook";
import loadSendPageToGraph from "./messages/sendPageToGraph";
import loadCopyBlockToGraph from "./messages/copyBlockToGraph";
import loadCrossGraphBlockReference from "./messages/crossGraphBlockReference";

export default runExtension({
  // migratedTo: "SamePage", // query github
  run: async ({ extensionAPI }) => {
    extensionAPI.settings.panel.create({
      tabTitle: "SamePage",
      settings: defaultSettings
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          action:
            s.type === "boolean"
              ? {
                  type: "switch" as const,
                }
              : undefined,
        }))
        .filter((s) => !!s.action),
    });
    addStyle(
      `div.samepage-notification-container { top: 40px; bottom: unset; }`
    );

    let removeLoadingCallback: () => void;
    const { unload: unloadSamePageClient, ...api } = setupSamePageClient({
      isAutoConnect: extensionAPI.settings.get("auto-connect") as boolean,
      addCommand: window.roamAlphaAPI.ui.commandPalette.addCommand,
      removeCommand: window.roamAlphaAPI.ui.commandPalette.removeCommand,
      renderOverlay,
      app: "Roam",
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
    onAppEvent("connection", (evt) => {
      if (evt.status === "PENDING") removeLoadingCallback = renderLoading();
      else removeLoadingCallback?.();
    });
    const unloadSharePageWithNotebook = setupSharePageWithNotebook();

    const unloadCopyBlockToGraph = loadCopyBlockToGraph(api);
    const unloadCrossGraphBlockReference = loadCrossGraphBlockReference(api);
    const unloadSendPageToGraph = loadSendPageToGraph(api);

    window.roamjs.extension[process.env.ROAMJS_EXTENSION_ID] = window.samepage;
    return () => {
      unloadSendPageToGraph();
      unloadCopyBlockToGraph();
      unloadCrossGraphBlockReference();

      unloadSharePageWithNotebook();
      unloadSamePageClient();
    };
  },
});
