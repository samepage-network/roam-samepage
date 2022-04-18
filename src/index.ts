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
              type: "custom",
              options: {
                component: OnlineGraphs,
              },
              description: "Graphs that are within your network",
            },
          ],
        },
        {
          id: "Asynchronous",
          toggleable: "premium",
          fields: [
            {
              title: "Networks",
              type: "custom",
              description:
                "View all the networks that your graph is currently in",
              options: {
                component: Networks,
              },
            },
            {
              title: "Disable Auto Connect",
              type: "flag",
              description:
                "Prevent the extension from automatically connecting to your configured networks",
            },
            {
              title: "Usage",
              type: "custom",
              description:
                "Displays how much the user has used Multiplayer this month",
              options: {
                component: UsageChart,
              },
            },
          ],
          onEnable: toggleOnAsync,
        },
      ],
    },
  });

  render({});

  const multiplayerApi = setupMultiplayer(pageUid);
  const { enable, ...api } = multiplayerApi;

  loadSendPageToGraph(api);
  loadCopyBlockToGraph(api);
  loadCrossGraphBlockReference(api);
  loadSharePageWithGraph(api);

  if (!loadedElsewhere) {
    enable();
  }

  window.roamjs.extension["multiplayer"] = multiplayerApi;
});
