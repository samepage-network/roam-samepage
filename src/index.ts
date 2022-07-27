import runExtension from "roamjs-components/util/runExtension";
import setupSamePageClient from "./components/setupSamePageClient";
import OnlineGraphs from "./components/OnlineGraphs";
import Networks from "./components/Networks";
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
import registerExperimentalMode from "roamjs-components/util/registerExperimentalMode";
import SharedPagesDashboard from "./components/SharedPagesDashboard";
import migrateLegacySettings from "roamjs-components/util/migrateLegacySettings";

const loadedElsewhere =
  document.currentScript &&
  !!document.currentScript.getAttribute("data-source");
const extensionId = process.env.ROAMJS_EXTENSION_ID;

export default runExtension({
  // uncomment when V1 is live in RoamDepot
  // migratedTo: "SamePage",
  extensionId,
  run: async ({ extensionAPI }) => {
    const styleEl = addStyle(`.roamjs-samepage-connected-network {
  padding: 8px;
  border-radius: 8px;
}

.roamjs-samepage-connected-network:hover {
  background: #33333330;
}

.roamjs-samepage-status-indicator {
  min-width: 12px;
  margin-right: 8px
}

.bp3-alert > .bp3-dialog-header {
  margin: -20px -20px 20px;
}`);
    extensionAPI.settings.panel.create({
      tabTitle: "SamePage",
      settings: [
        {
          id: "connected-graphs",
          name: "Connected Graphs",
          action: {
            type: "reactComponent",
            component: OnlineGraphs,
          },
          description: "Graphs that are within your network",
        },
        {
          id: "networks",
          name: "Networks",
          action: {
            type: "reactComponent",
            component: Networks,
          },
          description: "View all the networks that your graph is currently in",
        },
        {
          id: "shared-pages",
          name: "Shared Pages",
          action: {
            type: "reactComponent",
            component: SharedPagesDashboard,
          },
          description: "View all of the shared with other graphs.",
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

    const samePageApi = setupSamePageClient(
      () => extensionAPI.settings.get("auto-connect") as boolean
    );
    const { enable, ...api } = samePageApi;
    
    render(api);
    loadSendPageToGraph(api);
    loadCopyBlockToGraph(api);
    loadCrossGraphBlockReference(api);
    const experimentalLabel = registerExperimentalMode({
      feature: "Shared Pages",
      onEnable: () => loadSharePageWithGraph(api),
      onDisable: () => unloadSharePageWithGraph(api),
    });

    if (!loadedElsewhere) {
      enable();
    }

    window.roamjs.extension[extensionId] = samePageApi;
    return {
      elements: [styleEl],
      commands: [experimentalLabel],
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
    api.disable();
  },
});
