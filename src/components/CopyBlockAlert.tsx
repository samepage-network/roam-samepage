import React, { useCallback, useMemo, useState } from "react";
import { InputGroup, Label } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";
import GraphMessageAlert from "./GraphMessageAlert";
import type { SamePageProps } from "../types";

type Props = {
  blockUid: string;
} & SamePageProps;

const CopyBlockAlert = ({
  onClose,
  blockUid,
  sendToGraph,
  addGraphListener,
  removeGraphListener,
  getNetworkedGraphs,
}: { onClose: () => void } & Props) => {
  const [page, setPage] = useState("");
  const block = useMemo(
    () =>
      window.roamAlphaAPI.q(
        `[:find (pull ?b [[:block/string :as "text"] :block/heading [:block/text-align :as "textAlign"]]) :where [?b :block/uid "${blockUid}"]]`
      )[0][0],
    [blockUid]
  );
  const onSubmit = useCallback(
    async (graph: string) => {
      sendToGraph({
        graph,
        operation: "COPY_BLOCK",
        data: { block, page, blockUid },
      });
      addGraphListener({
        operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
        handler: (_, graph) => {
          removeGraphListener({
            operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
          });
          renderToast({
            id: "copy-block-success",
            content: `Successfully sent block ${blockUid} to ${graph}!`,
          });
        },
      });
    },
    [page]
  );
  return (
    <GraphMessageAlert
      title={`Copy Block to Graph`}
      onClose={onClose}
      onSubmitToGraph={onSubmit}
      disabled={!page}
      allGraphs={getNetworkedGraphs()}
    >
      <Label>
        Page
        <InputGroup value={page} onChange={(e) => setPage(e.target.value)} />
      </Label>
    </GraphMessageAlert>
  );
};

export const render = createOverlayRender("copy-block-alert", CopyBlockAlert);

export default CopyBlockAlert;
