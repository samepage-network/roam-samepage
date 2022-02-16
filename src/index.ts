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
import setupMultiplayer, { toggleOnAsync } from "./components/setupMultiplayer";
import { InputTextNode } from "roamjs-components/types";
import { render as renderToast } from "roamjs-components/components/Toast";
import OnlineGraphs from "./components/OnlineGraphs";
import Networks from "./components/Networks";
import addBlockCommand from "roamjs-components/dom/addBlockCommand";
import { render as copyRender } from "./components/CopyBlockAlert";
import { getPageUidByPageTitle } from "roamjs-components";

const loadedElsewhere = !!document.currentScript.getAttribute("data-source");
const ID = "multiplayer";
const CONFIG = toConfigPageName(ID);
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
          toggleable: true,
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
          ],
          onEnable: toggleOnAsync,
          development: process.env.NODE_ENV !== "development",
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

    window.roamAlphaAPI.ui.commandPalette.addCommand({
      label: "Copy Block to Graph",
      callback: () => {
        const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()["block-uid"];
        copyRender({ blockUid });
      },
    });

    addGraphListener({
      operation: "COPY_BLOCK",
      handler: (e, graph) => {
        const { block, page, blockUid } = e as {
          block: InputTextNode;
          page: string;
          blockUid: string;
        };
        const pageUid = getPageUidByPageTitle(page);
        (pageUid ? Promise.resolve(pageUid) : createPage({ title: page }))
          .then((pageUid) => {
            const order = getChildrenLengthByPageUid(pageUid);
            return createBlock({
              parentUid: pageUid,
              order,
              node: block,
            });
          })
          .then(() => {
            renderToast({
              id: "copy-block-success",
              content: `Pasted new block in page ${page} from ${graph}!`,
            });
            sendToGraph({
              graph,
              operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
            });
          });
      },
    });
  }
  window.roamjs.extension["multiplayer"] = multiplayerApi;
});
