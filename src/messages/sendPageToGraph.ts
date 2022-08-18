import { render as renderToast } from "roamjs-components/components/Toast";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import { InputTextNode } from "roamjs-components/types/native";
import createBlock from "roamjs-components/writes/createBlock";
import createPage from "roamjs-components/writes/createPage";
import { render as pageRender } from "../components/SendPageDialog";
import type { SamePageApi } from "../types";

const load = (api: SamePageApi) => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Send Page to Graph",
    callback: () => {
      pageRender({ pageUid: getCurrentPageUid(), ...api });
    },
  });
  const { addNotebookListener, sendToNotebook, removeNotebookListener } = api;
  addNotebookListener({
    operation: "SEND_PAGE",
    handler: (e, source) => {
      const { uid, title, tree } = e as {
        uid: string;
        title: string;
        tree: InputTextNode[];
      };
      const existingUid = getPageUidByPageTitle(title);
      const order = existingUid ? getChildrenLengthByPageUid(existingUid) : 0;
      return (
        existingUid
          ? Promise.all(
              tree.map((node, i) =>
                createBlock({
                  node,
                  order: order + i,
                  parentUid: existingUid,
                })
              )
            )
          : createPage({ uid, title, tree })
      )
        .then(() => {
          const parentUid = window.roamAlphaAPI.util.dateToPageUid(new Date());
          return createBlock({
            parentUid,
            order: getChildrenLengthByPageUid(parentUid),
            node: {
              text: `[[${source.workspace}]] sent over page [[${title}]]`,
            },
          });
        })
        .then(() => {
          renderToast({
            id: "send-page-success",
            content: `Received new page ${title} from ${source.workspace}!`,
          });
          sendToNotebook({
            target: source,
            operation: `SEND_PAGE_RESPONSE/${source.workspace}/${uid}`,
            data: {
              ephemeral: true,
            },
          });
        });
    },
  });
  return () => {
    removeNotebookListener({ operation: "SEND_PAGE" });
    window.roamAlphaAPI.ui.commandPalette.removeCommand({
      label: "Send Page to Graph",
    });
  };
};

export default load;
