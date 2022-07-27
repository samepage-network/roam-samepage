import React, { useCallback } from "react";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import GraphMessageAlert from "./GraphMessageAlert";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import { gatherActions } from "roamjs-components/writes/createBlock";
import type { SamePageProps, SharedPages } from "../types";
import { addSharedPage } from "../messages/sharePageWithGraph";
import { render as renderToast } from "roamjs-components/components/Toast";
import apiClient from "../apiClient";

type Props = {
  pageUid: string;
  sharedPages: SharedPages;
} & SamePageProps;

const SharePageAlert = ({
  onClose,
  pageUid,
  sharedPages,
  sendToGraph,
  getNetworkedGraphs,
}: { onClose: () => void } & Props) => {
  const onSubmit = useCallback(
    (graph: string) => {
      return apiClient<{ id: string; created: boolean }>({
        method: "init-shared-page",
        data: {
          uid: pageUid,
        },
      })
        .then((r) => {
          addSharedPage(pageUid);
          const title = getPageTitleByPageUid(pageUid);
          sendToGraph({
            graph,
            operation: "SHARE_PAGE",
            data: {
              id: r.id,
              uid: pageUid,
              title: title || getTextByBlockUid(pageUid),
              isPage: !!title,
            },
          });
          if (r.created) {
            const tree = getFullTreeByParentUid(pageUid);
            const log = tree.children
              .flatMap((node, order) =>
                gatherActions({ node, order, parentUid: pageUid })
              )
              .map((params) => ({ params, action: "createBlock" }));
            sharedPages.indices[pageUid] = log.length;
            return apiClient({
              method: "update-shared-page",
              data: {
                uid: pageUid,
                log,
              },
            });
          }
        })
        .then(() => {
          renderToast({
            id: "share-page-success",
            content: `Successfully shared page with ${graph}! We will now await for them to accept.`,
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
        allGraphs={getNetworkedGraphs()}
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
