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
import { setupMultiplayer } from "./components/Multiplayer";
import { InputTextNode } from "roamjs-components/types";

const ID = "multiplayer";
const CONFIG = toConfigPageName(ID);
runExtension(ID, () => {
  /*const { pageUid } = */ createConfigObserver({
    title: CONFIG,
    config: {
      tabs: [],
    },
  });

  const { enable, addGraphListener, sendToGraph, getConnectedGraphs } =
    setupMultiplayer();
  enable();
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Send Page to Graphs",
    callback: () => {
      const uid = getCurrentPageUid();
      const title = getPageTitleByPageUid(uid);
      const tree = getFullTreeByParentUid(uid).children;
      getConnectedGraphs().forEach((graph) =>
        sendToGraph({
          graph,
          operation: "SEND_PAGE",
          data: {
            uid,
            title,
            tree,
          },
        })
      );
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
    },
  });
});
