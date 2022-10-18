import setupSamePageClient from "samepage/protocols/setupSamePageClient";
import defaultSettings from "samepage/utils/defaultSettings";
import { onAppEvent } from "samepage/internal/registerAppEventListener";
import runExtension from "roamjs-components/util/runExtension";
import { render as renderToast } from "roamjs-components/components/Toast";
import { renderLoading } from "roamjs-components/components/Loading";
import renderOverlay from "roamjs-components/util/renderOverlay";
import addStyle from "roamjs-components/dom/addStyle";
import setupSharePageWithNotebook, {
  granularChanges,
} from "./messages/sharePageWithNotebook";
import loadSendPageToGraph from "./messages/sendPageToGraph";
import loadCopyBlockToGraph from "./messages/copyBlockToGraph";
import loadCrossGraphBlockReference from "./messages/crossGraphBlockReference";
import { OnloadArgs } from "roamjs-components/types";
import React from "react";

const IGNORED_LOGS = new Set([
  "list-pages-success",
  "load-remote-message",
  "update-success",
]);

type Action = Parameters<
  OnloadArgs["extensionAPI"]["settings"]["panel"]["create"]
>[0]["settings"][number];

export default runExtension({
  // migratedTo: "SamePage",
  run: async ({ extensionAPI, extension }) => {
    extensionAPI.settings.panel.create({
      tabTitle: "SamePage",
      settings: [
        {
          id: "display-version",
          name: "Version",
          description: "The SamePage published version of this extension",
          action: {
            type: "reactComponent",
            component: () =>
              React.createElement(
                "span",
                {},
                process.env.VERSION || extension.version
              ),
          },
        } as Action,
      ].concat(
        defaultSettings
          .map(
            (s) =>
              ({
                id: s.id,
                name: s.name,
                description: s.description,
                action:
                  s.type === "boolean"
                    ? {
                        type: "switch" as const,
                        onChange: (e) =>
                          s.id === "granular-changes" &&
                          (granularChanges.enabled = e.target.checked),
                      }
                    : s.type === "string"
                    ? {
                        type: "input",
                        placeholder: s.default,
                      }
                    : undefined,
              } as Action)
          )
          .filter((s) => !!s.action)
      ),
    });
    granularChanges.enabled = !!extensionAPI.settings.get("granular-changes");
    addStyle(
      `div.samepage-notification-container { top: 40px; bottom: unset; } 

.samepage-shared-page-status img {
  margin: 0;
}`
    );

    let removeLoadingCallback: () => void;
    const { unload: unloadSamePageClient, ...api } = setupSamePageClient({
      getSetting: (s) => (extensionAPI.settings.get(s) as string) || "",
      setSetting: (s, v) => extensionAPI.settings.set(s, v),
      addCommand: window.roamAlphaAPI.ui.commandPalette.addCommand,
      removeCommand: window.roamAlphaAPI.ui.commandPalette.removeCommand,
      renderOverlay: (args) => {
        if (args.id && args.id.startsWith("samepage-shared")) {
          return renderOverlay({ ...args, before: 1 }) || (() => {});
        }
        return renderOverlay(args) || (() => {});
      },
      app: "Roam",
      workspace: window.roamAlphaAPI.graph.name,
    });
    onAppEvent(
      "log",
      (evt) =>
        !IGNORED_LOGS.has(evt.id) &&
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

    // @ts-ignore
    window.roamjs.extension.samepage = window.samepage;
    return () => {
      unloadSendPageToGraph();
      unloadCopyBlockToGraph();
      unloadCrossGraphBlockReference();

      unloadSharePageWithNotebook();
      unloadSamePageClient();
    };
  },
});
