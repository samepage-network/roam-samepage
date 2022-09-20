import React, { useCallback, useMemo, useState } from "react";
import { InputGroup, Label } from "@blueprintjs/core";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";
import GraphMessageDialog from "./GraphMessageDialog";
import type { Notebook } from "samepage/types";
import { PullBlock } from "roamjs-components/types/native";

type Props = {
  blockUid: string;
} & typeof window.samepage;

const CopyBlockDialog = ({
  onClose,
  blockUid,
  sendToNotebook,
  addNotebookListener,
  removeNotebookListener,
}: { onClose: () => void } & Props) => {
  const [page, setPage] = useState("");
  const block = useMemo(() => {
    const block = window.roamAlphaAPI.data.fast.q(
      `[:find (pull ?b [:block/string :block/heading :block/text-align]) :where [?b :block/uid "${blockUid}"]]`
    )[0][0] as PullBlock;
    return {
      text: block[":block/string"] || "",
      heading: block[":block/heading"] || 0,
      textAlign: block[":block/text-align"] || "left",
    };
  }, [blockUid]);
  const onSubmit = useCallback(
    async (targets: Notebook[]) => {
      targets.map((target) => {
        sendToNotebook({
          target,
          operation: "COPY_BLOCK",
          data: { block, page, blockUid },
        });
        addNotebookListener({
          operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
          handler: (_, graph) => {
            removeNotebookListener({
              operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
            });
            renderToast({
              id: "copy-block-success",
              content: `Successfully sent block ${blockUid} to ${graph}!`,
            });
          },
        });
      });
    },
    [page]
  );
  return (
    <GraphMessageDialog
      title={`Copy Block to Graph`}
      onClose={onClose}
      onSubmit={onSubmit}
      disabled={!page}
    >
      <Label>
        Page
        <InputGroup value={page} onChange={(e) => setPage(e.target.value)} />
      </Label>
    </GraphMessageDialog>
  );
};

export const render = createOverlayRender<Props>(
  "copy-block-alert",
  CopyBlockDialog
);

export default CopyBlockDialog;
