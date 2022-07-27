import { render as renderToast } from "roamjs-components/components/Toast";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import type { InputTextNode } from "roamjs-components/types";
import createBlock from "roamjs-components/writes/createBlock";
import createPage from "roamjs-components/writes/createPage";
import type { SamePageProps } from "../types";
import { render as copyRender } from "../components/CopyBlockAlert";

const load = (props: SamePageProps) => {
  const { addGraphListener, sendToGraph } = props;
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Copy Block to Graph",
    callback: () => {
      const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()["block-uid"];
      copyRender({ blockUid, ...props });
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
};

export const unload = ({ removeGraphListener }: SamePageProps) => {
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Copy Block to Graph",
  });
  removeGraphListener({
    operation: "COPY_BLOCK",
  });
};

export default load;
