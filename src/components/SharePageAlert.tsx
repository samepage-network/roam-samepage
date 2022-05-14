import React, { useCallback } from "react";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import GraphMessageAlert from "./GraphMessageAlert";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import apiPost from "roamjs-components/util/apiPost";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import { gatherActions } from "roamjs-components/writes/createBlock";
import { SharedPages } from "../types";
import { addSharedPage } from "../messages/sharePageWithGraph";

type Props = {
  pageUid: string;
  sharedPages: SharedPages;
};

const SharePageAlert = ({
  onClose,
  pageUid,
  sharedPages,
}: { onClose: () => void } & Props) => {
  const onSubmit = useCallback(
    (graph: string) => {
      apiPost("multiplayer", {
        method: "init-shared-page",
        graph,
        uid: pageUid,
      }).then((r) => {
        addSharedPage(pageUid);
        const title = getPageTitleByPageUid(pageUid);
        window.roamjs.extension.multiplayer.sendToGraph({
          graph,
          operation: "SHARE_PAGE",
          data: {
            id: r.data.id,
            uid: pageUid,
            title: title || getTextByBlockUid(pageUid),
            isPage: !!title,
          },
        });
        const tree = getFullTreeByParentUid(pageUid);
        const log = tree.children
          .flatMap((node, order) =>
            gatherActions({ node, order, parentUid: pageUid })
          )
          .map((params) => ({ params, action: "createBlock" }));
        sharedPages.indices[pageUid] = log.length;
        return apiPost("multiplayer", {
          method: "update-shared-page",
          graph,
          uid: pageUid,
          log,
        });
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
