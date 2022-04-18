import { render as renderToast } from "roamjs-components/components/Toast";
import toRoamDateUid from "roamjs-components/date/toRoamDateUid";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import { InputTextNode } from "roamjs-components/types";
import createBlock from "roamjs-components/writes/createBlock";
import createPage from "roamjs-components/writes/createPage";
import { render as pageRender } from "../components/SendPageAlert";
import type { MessageLoaderProps } from "../components/setupMultiplayer";

const load = ({ addGraphListener, sendToGraph }: MessageLoaderProps) => {
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
        .then(() =>
          createBlock({
            parentUid: toRoamDateUid(),
            order: getChildrenLengthByPageUid(toRoamDateUid()),
            node: { text: `[[${graph}]] sent over page [[${title}]]` },
          })
        )
        .then(() => {
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
        });
    },
  });
};

export default load;
