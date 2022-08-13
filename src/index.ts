import runExtension from "roamjs-components/util/runExtension";
import setupSamePageClient, {
  sendToGraph,
  unloadSamePageClient,
} from "./components/setupSamePageClient";
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
import migrateLegacySettings from "roamjs-components/util/migrateLegacySettings";
import {
  addGraphListener,
  removeGraphListener,
} from "./components/setupMessageHandlers";

const extensionId = process.env.ROAMJS_EXTENSION_ID;

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
    migrateLegacySettings({ extensionAPI, extensionId });

    setupSamePageClient({
      isAutoConnect: extensionAPI.settings.get("auto-connect") as boolean,
    });

    loadSharePageWithGraph();
    loadCopyBlockToGraph();
    loadCrossGraphBlockReference();
    loadSendPageToGraph();

    window.roamjs.extension[process.env.ROAMJS_EXTENSION_ID] = {
      addGraphListener,
      removeGraphListener,
      sendToGraph,
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
