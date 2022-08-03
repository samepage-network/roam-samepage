import runExtension from "roamjs-components/util/runExtension";
import setupSamePageClient, {
  unloadSamePageClient,
} from "./components/setupSamePageClient";
import addStyle from "roamjs-components/dom/addStyle";
import UsageChart from "./components/UsageChart";
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
import SharedPagesDashboard from "./components/SharedPagesDashboard";
import migrateLegacySettings from "roamjs-components/util/migrateLegacySettings";

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
          id: "shared-pages",
          name: "Shared Pages",
          action: {
            type: "reactComponent",
            component: SharedPagesDashboard,
          },
          description: "View all of the shared with other notebooks.",
        },
        {
          id: "auto-connect",
          name: "Auto Connect",
          action: {
            type: "switch",
          },
          description: "Automatically connect to SamePage Network",
        },
        {
          id: "usage",
          name: "Usage",
          action: {
            type: "reactComponent",
            component: UsageChart,
          },
          description:
            "Displays how much the user has used the SamePage network this month. Price is not actually charged, but to inform what might be used in the future.",
        },
      ],
    });
    migrateLegacySettings({ extensionAPI, extensionId });

    const api = setupSamePageClient(
      extensionAPI.settings.get("auto-connect") as boolean
    );

    render(api);
    loadSendPageToGraph(api);
    loadCopyBlockToGraph(api);
    loadCrossGraphBlockReference(api);
    loadSharePageWithGraph(api);

    window.roamjs.extension[extensionId] = api;
    return {
      elements: [styleEl],
    };
  },
  unload: () => {
    const api = window.roamjs.extension[extensionId] as ReturnType<
      typeof setupSamePageClient
    >;
    unloadSharePageWithGraph(api);
    unloadSendPageToGraph(api);
    unloadCopyBlockToGraph(api);
    unloadCrossGraphBlockReference(api);
    unloadSamePageClient();
  },
});
