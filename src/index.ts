import toConfigPageName from "roamjs-components/util/toConfigPageName";
import runExtension from "roamjs-components/util/runExtension";
import { createConfigObserver } from "roamjs-components/components/ConfigPage";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import createPage from "roamjs-components/writes/createPage";
import createBlock from "roamjs-components/writes/createBlock";
import toRoamDateUid from "roamjs-components/date/toRoamDateUid";
import setupMultiplayer, {
  sendToBackend,
  toggleOnAsync,
} from "./components/setupMultiplayer";
import { InputTextNode } from "roamjs-components/types";
import { render as renderToast } from "roamjs-components/components/Toast";
import OnlineGraphs from "./components/OnlineGraphs";
import Networks from "./components/Networks";
import { render as pageRender } from "./components/SendPageAlert";
import { render as copyRender } from "./components/CopyBlockAlert";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import { render as referenceRender } from "./components/CrossGraphReference";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import addStyle from "roamjs-components/dom/addStyle";
import getGraph from "roamjs-components/util/getGraph";

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
          ],
          onEnable: toggleOnAsync,
        },
      ],
    },
  });

  const multiplayerApi = setupMultiplayer(pageUid);
  if (!loadedElsewhere) {
    const { enable, addGraphListener, sendToGraph, getNetworkedGraphs } =
      multiplayerApi;

    enable();

    window.roamAlphaAPI.ui.commandPalette.addCommand({
      label: "Send Page to Graph",
      callback: () => {
        pageRender({ pageUid: getCurrentPageUid() });
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
        sendToGraph({
          graph,
          operation: `SEND_PAGE_RESPONSE/${graph}/${uid}`,
          data: {
            ephemeral: true,
          },
        });
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
              data: {
                ephemeral: true,
              },
            });
          });
      },
    });

    addGraphListener({
      operation: "QUERY_REF",
      handler: (e, graph) => {
        const { uid } = e as { uid: string };
        const node = getFullTreeByParentUid(uid);
        sendToBackend({
          operation: "QUERY_REF_RESPONSE",
          data: {
            found: !!node.uid,
            node,
            graph,
          },
        });
      },
    });
    createHTMLObserver({
      callback: (s) => referenceRender(s, getNetworkedGraphs),
      tag: "SPAN",
      className: "rm-paren--closed",
    });
    window.roamAlphaAPI.ui.commandPalette.addCommand({
      label: "Copy Cross Graph Block Reference",
      callback: () => {
        const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()["block-uid"];
        window.navigator.clipboard.writeText(`((${getGraph()}:${blockUid}))`);
      },
    });
  }

  window.roamjs.extension["multiplayer"] = multiplayerApi;
});
