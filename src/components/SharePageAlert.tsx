import React, { useCallback, useMemo } from "react";
import { Intent } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import GraphMessageAlert from "./GraphMessageAlert";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";

type Props = {
  pageUid: string;
};

const SharePageAlert = ({
  onClose,
  pageUid,
}: { onClose: () => void } & Props) => {
  const tree = useMemo(
    () => getFullTreeByParentUid(pageUid).children,
    [pageUid]
  );
  const onSubmit = useCallback(
    (graph: string) => {
      const title = getPageTitleByPageUid(pageUid);
      window.roamjs.extension.multiplayer.sendToGraph({
        graph,
        operation: "SHARE_PAGE",
        data: {
          uid: pageUid,
          title: title || getTextByBlockUid(pageUid),
          isPage: !!title,
          tree,
        },
      });
      window.roamjs.extension.multiplayer.addGraphListener({
        operation: `SHARE_PAGE_RESPONSE/${graph}/${pageUid}`,
        handler: (data, graph) => {
          window.roamjs.extension.multiplayer.removeGraphListener({
            operation: `SHARE_PAGE_RESPONSE/${graph}/${pageUid}`,
          });
          const { success } = data as { success: boolean };
          if (success)
            renderToast({
              id: "share-page-success",
              content: `Successfully shared ${pageUid} with ${graph}!`,
              intent: Intent.SUCCESS,
            });
          else
            renderToast({
              id: "share-page-failure",
              content: `Graph ${graph} rejected ${pageUid}`,
            });
        },
      });
    },
    [pageUid]
  );
  return (
    <>
      <GraphMessageAlert
        title={`Share Page with Graph`}
        onClose={onClose}
        onSubmitToGraph={onSubmit}
      >
        <p>
          Sharing this page means that all graphs with access to it will be able
          to edit its child blocks.
        </p>
      </GraphMessageAlert>
    </>
  );
};

export const render = createOverlayRender("share-page-alert", SharePageAlert);

export default SharePageAlert;
