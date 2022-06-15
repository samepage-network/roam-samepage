import React, { useCallback, useMemo, useState } from "react";
import { InputGroup, Label } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import GraphMessageAlert from "./GraphMessageAlert";

type Props = {
  pageUid: string;
};

const SendPageAlert = ({
  onClose,
  pageUid,
}: { onClose: () => void } & Props) => {
  const [page, setPage] = useState(() => getPageTitleByPageUid(pageUid));
  const tree = useMemo(
    () => getFullTreeByParentUid(pageUid).children,
    [pageUid]
  );
  const onSubmit = useCallback(
    async (graph: string) => {
      window.roamjs.extension.multiplayer.sendToGraph({
        graph,
        operation: "SEND_PAGE",
        data: {
          uid: pageUid,
          title: page,
          tree,
        },
      });
      window.roamjs.extension.multiplayer.addGraphListener({
        operation: `SEND_PAGE_RESPONSE/${graph}/${pageUid}`,
        handler: (_, graph) => {
          window.roamjs.extension.multiplayer.removeGraphListener({
            operation: `SEND_PAGE_RESPONSE/${graph}/${pageUid}`,
          });
          renderToast({
            id: "send-page-success",
            content: `Successfully sent page ${page} to ${graph}!`,
          });
        },
      });
    },
    [page]
  );
  return (
    <>
      <GraphMessageAlert
        title={`Send Page to Graph`}
        onClose={onClose}
        disabled={!page}
        onSubmitToGraph={onSubmit}
      >
        <Label>
          Page
          <InputGroup value={page} onChange={(e) => setPage(e.target.value)} />
        </Label>
      </GraphMessageAlert>
    </>
  );
};

export const render = createOverlayRender("send-page-alert", SendPageAlert);

export default SendPageAlert;
