import toConfigPageName from "roamjs-components/util/toConfigPageName";
import runExtension from "roamjs-components/util/runExtension";
import { createConfigObserver } from "roamjs-components/components/ConfigPage";
import setupMultiplayer, { toggleOnAsync } from "./components/setupMultiplayer";
import OnlineGraphs from "./components/OnlineGraphs";
import Networks from "./components/Networks";
import addStyle from "roamjs-components/dom/addStyle";
import UsageChart from "./components/UsageChart";
import loadSendPageToGraph from "./messages/sendPageToGraph";
import loadCopyBlockToGraph from "./messages/copyBlockToGraph";
import loadCrossGraphBlockReference from "./messages/crossGraphBlockReference";
import loadSharePageWithGraph from "./messages/sharePageWithGraph";
import { render } from "./components/NotificationContainer";
import CustomPanel from "roamjs-components/components/ConfigPanels/CustomPanel";
import FlagPanel from "roamjs-components/components/ConfigPanels/FlagPanel";
import type {
  Field,
  CustomField,
} from "roamjs-components/components/ConfigPanels/types";
import localStorageGet from "roamjs-components/util/localStorageGet";

const loadedElsewhere = !!document.currentScript.getAttribute("data-source");
const ID = "multiplayer";
const CONFIG = toConfigPageName(ID);
addStyle(`.roamjs-multiplayer-connected-network {
  padding: 8px;
  border-radius: 8px;
}

.roamjs-multiplayer-connected-network:hover {
  background: #33333330;
}

.roamjs-multiplayer-status-indicator {
  min-width: 12px;
  margin-right: 8px
}

.bp3-alert > .bp3-dialog-header {
  margin: -20px -20px 20px;
}`);

runExtension(ID, async () => {
  const { pageUid } = await createConfigObserver({
    title: CONFIG,
    config: {
      versioning: true,
      tabs: [
        {
          id: "Synchronous",
          fields: [
            {
              title: "Connected Graphs",
              Panel: CustomPanel,
              options: {
                component: OnlineGraphs,
              },
              description: "Graphs that are within your network",
            } as Field<CustomField>,
          ],
        },
        {
          id: "Asynchronous",
          toggleable: "premium",
          fields: [
            {
              title: "Networks",
              Panel: CustomPanel,
              description:
                "View all the networks that your graph is currently in",
              options: {
                component: Networks,
              },
            } as Field<CustomField>,
            {
              title: "Disable Auto Connect",
              Panel: FlagPanel,
              description:
                "Prevent the extension from automatically connecting to your configured networks",
            },
            {
              title: "Usage",
              Panel: CustomPanel,
              description:
                "Displays how much the user has used Multiplayer this month",
              options: {
                component: UsageChart,
              },
            } as Field<CustomField>,
          ],
          onEnable: toggleOnAsync,
        },
      ],
    },
  });

  render({ configUid: pageUid });

  const multiplayerApi = setupMultiplayer(pageUid);
  const { enable, ...api } = multiplayerApi;

  loadSendPageToGraph(api);
  loadCopyBlockToGraph(api);
  loadCrossGraphBlockReference(api);
  if (localStorageGet("experimental") === "true") {
    loadSharePageWithGraph(api);
  }

  if (!loadedElsewhere) {
    enable();
  }

  window.roamjs.extension["multiplayer"] = multiplayerApi;
});
