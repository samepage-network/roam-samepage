import runExtension from "roamjs-components/util/runExtension";
import setupSamePageClient, {
  sendToGraph,
  unloadSamePageClient,
} from "./components/setupSamePageClient";
import addStyle from "roamjs-components/dom/addStyle";
import { render as renderUsage } from "./components/UsageChart";
import loadSendPageToGraph, {
  unload as unloadSendPageToGraph,
} from "./messages/sendPageToGraph";
import loadCopyBlockToGraph, {
  unload as unloadCopyBlockToGraph,
} from "./messages/copyBlockToGraph";
import loadCrossGraphBlockReference, {
  unload as unloadCrossGraphBlockReference,
} from "./messages/crossGraphBlockReference";
import loadSharePageWithGraph, {
  unload as unloadSharePageWithGraph,
} from "./messages/sharePageWithGraph";
import { render } from "./components/NotificationContainer";
import migrateLegacySettings from "roamjs-components/util/migrateLegacySettings";
import {
  addGraphListener,
  removeGraphListener,
} from "./components/setupMessageHandlers";

const extensionId = process.env.ROAMJS_EXTENSION_ID;

export default runExtension({
  // uncomment when V1 is live in RoamDepot
  // migratedTo: "SamePage",
  extensionId,
  run: async ({ extensionAPI }) => {
    const styleEl = addStyle(`.bp3-alert > .bp3-dialog-header {
  margin: -20px -20px 20px;
}`);
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
    migrateLegacySettings({ extensionAPI, extensionId });

    setupSamePageClient(extensionAPI.settings.get("auto-connect") as boolean);
    render({});
    loadCopyBlockToGraph();
    loadCrossGraphBlockReference();
    loadSendPageToGraph();
    loadSharePageWithGraph();

    window.roamjs.extension[extensionId] = {
      addGraphListener,
      removeGraphListener,
      sendToGraph,
    };

    const USAGE_LABEL = "View SamePage Usage";
    window.roamAlphaAPI.ui.commandPalette.addCommand({
      label: USAGE_LABEL,
      callback: () => {
        renderUsage({});
      },
    });
    return {
      elements: [styleEl],
      commands: [USAGE_LABEL],
    };
  },
  unload: () => {
    unloadSharePageWithGraph();
    unloadSendPageToGraph();
    unloadCopyBlockToGraph();
    unloadCrossGraphBlockReference();
    unloadSamePageClient();
  },
});
