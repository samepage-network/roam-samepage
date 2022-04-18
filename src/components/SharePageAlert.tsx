import React, { useCallback, useMemo } from "react";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
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
