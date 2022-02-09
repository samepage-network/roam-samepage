import toConfigPageName from "roamjs-components/util/toConfigPageName";
import runExtension from "roamjs-components/util/runExtension";
import { createConfigObserver } from "roamjs-components/components/ConfigPage";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import createPage from "roamjs-components/writes/createPage";
import createBlock from "roamjs-components/writes/createBlock";
import toRoamDateUid from "roamjs-components/date/toRoamDateUid";
import setupMultiplayer, {toggleOnAsync} from "./components/setupMultiplayer";
import { InputTextNode } from "roamjs-components/types";
import { render as renderToast } from "roamjs-components/components/Toast";
import OnlineGraphs from "./components/OnlineGraphs";
import Networks from "./components/Networks";

const loadedElsewhere = !!document.currentScript.getAttribute("data-source");
const ID = "multiplayer";
const CONFIG = toConfigPageName(ID);
runExtension(ID, async () => {
  const { pageUid } = await createConfigObserver({
    title: CONFIG,
    config: {
      tabs: [
        {
          id: "Synchronous",
          fields: [
            {
              title: "Graphs Online",
              type: "custom",
              options: {
                component: OnlineGraphs,
              },
              description: "Graphs that are online and directly connected to",
            },
          ],
        },
        {
          id: "Asynchronous",
          toggleable: true,
          fields: [
            {
              title: "Networks",
              type: "custom",
              description: "View all the networks that your graph is currently in",
              options: {
                component: Networks
              }
            }
          ],
          onEnable: toggleOnAsync,
          // development: true,
        },
      ],
    },
  });

  const multiplayerApi = setupMultiplayer(pageUid);
  if (!loadedElsewhere) {
    const {
      enable,
      addGraphListener,
      sendToGraph,
      getConnectedGraphs,
      removeGraphListener,
    } = multiplayerApi;
    enable();
    window.roamAlphaAPI.ui.commandPalette.addCommand({
      label: "Send Page to Graphs",
      callback: () => {
        const uid = getCurrentPageUid();
        const title = getPageTitleByPageUid(uid);
        const tree = getFullTreeByParentUid(uid).children;
        getConnectedGraphs().forEach((graph) => {
          sendToGraph({
            graph,
            operation: "SEND_PAGE",
            data: {
              uid,
              title,
              tree,
            },
          });
          addGraphListener({
            operation: `SEND_PAGE_RESPONSE/${uid}`,
            handler: (_, graph) => {
              removeGraphListener({ operation: `SEND_PAGE_RESPONSE/${uid}` });
              renderToast({
                id: "send-page-success",
                content: `Successfully sent page ${title} to ${graph}!`,
              });
            },
          });
        });
      },
    });
    addGraphListener({
      operation: "SEND_PAGE",
      handler: (e, graph) => {
        const { uid, title, tree } = e as {
          uid: string;
          title: string;
          tree: InputTextNode[];
        };
        createPage({ uid, title, tree });
        createBlock({
          parentUid: toRoamDateUid(),
          order: getChildrenLengthByPageUid(toRoamDateUid()),
          node: { text: `[[${graph}]] sent over page [[${title}]]` },
        });
        renderToast({
          id: "send-page-success",
          content: `Received new page ${title} from ${graph}!`,
        });
        sendToGraph({ graph, operation: `SEND_PAGE_RESPONSE/${uid}` });
      },
    });
  }
  window.roamjs.extension["multiplayer"] = multiplayerApi;
});
