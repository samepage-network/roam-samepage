import React, { useCallback, useMemo, useState } from "react";
import { InputGroup, Label } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import GraphMessageDialog from "./GraphMessageDialog";
import type { SamePageApi } from "../types";
import type { Notebook } from "@samepage/client/types";

type Props = {
  pageUid: string;
} & SamePageApi;

const SendPageAlert = ({
  onClose,
  pageUid,
  sendToNotebook,
  addNotebookListener,
  removeNotebookListener,
}: { onClose: () => void } & Props) => {
  const [page, setPage] = useState(() => getPageTitleByPageUid(pageUid));
  const tree = useMemo(
    () => getFullTreeByParentUid(pageUid).children,
    [pageUid]
  );
  const onSubmit = useCallback(
    async (targets: Notebook[]) => {
      targets.map((target) => {
        sendToNotebook({
          target,
          operation: "SEND_PAGE",
          data: {
            uid: pageUid,
            title: page,
            tree,
          },
        });
        addNotebookListener({
          operation: `SEND_PAGE_RESPONSE/${target.workspace}/${pageUid}`,
          handler: (_, graph) => {
            removeNotebookListener({
              operation: `SEND_PAGE_RESPONSE/${graph}/${pageUid}`,
            });
            renderToast({
              id: "send-page-success",
              content: `Successfully sent page ${page} to ${graph}!`,
            });
          },
        });
      });
    },
    [page]
  );
  return (
    <>
      <GraphMessageDialog
        title={`Send Page to Graph`}
        onClose={onClose}
        disabled={!page}
        onSubmit={onSubmit}
      >
        <Label>
          Page
          <InputGroup value={page} onChange={(e) => setPage(e.target.value)} />
        </Label>
      </GraphMessageDialog>
    </>
  );
};

export const render = createOverlayRender<Props>(
  "send-page-alert",
  SendPageAlert
);

export default SendPageAlert;
