import React, { useCallback, useState } from "react";
import {
  Button,
  Classes,
  Dialog,
  InputGroup,
  Intent,
  Label,
} from "@blueprintjs/core";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { render as renderToast } from "roamjs-components/components/Toast";

type Props = {
  blockUid: string;
};

const CopyBlockAlert = ({
  onClose,
  blockUid,
}: { onClose: () => void } & Props) => {
  const [page, setPage] = useState("");
  const [graph, setGraph] = useState("");
  const onSubmit = useCallback(() => {
    const block = window.roamAlphaAPI.q(
      `[:find (pull ?b [[:block/string :as "text"] :block/heading [:block/text-align :as "textAlign"]]) :where [?b :block/uid "${blockUid}"]]`
    )[0][0];
    window.roamjs.extension.multiplayer.sendToGraph({
      graph,
      operation: "COPY_BLOCK",
      data: { block, page, blockUid },
    });
    window.roamjs.extension.multiplayer.addGraphListener({
      operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
      handler: (_, graph) => {
        window.roamjs.extension.multiplayer.removeGraphListener({
          operation: `COPY_BLOCK_RESPONSE/${blockUid}`,
        });
        renderToast({
          id: "copy-block-success",
          content: `Successfully sent block ${blockUid} to ${graph}!`,
        });
      },
    });
    onClose();
  }, [page, onClose, graph]);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        page &&
        graph
      ) {
        onSubmit();
      }
    },
    [onSubmit, page, graph]
  );
  return (
    <>
      <Dialog
        isOpen={true}
        title={`Copy Block to Graph`}
        onClose={onClose}
        isCloseButtonShown
        canOutsideClickClose
        canEscapeKeyClose
      >
        <div
          className={Classes.DIALOG_BODY}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Label>
            Page
            <InputGroup
              value={page}
              onChange={(e) => setPage(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </Label>
          <MenuItemSelect
            items={window.roamjs.extension.multiplayer.getNetworkedGraphs()}
            activeItem={graph}
            onItemSelect={(e) => setGraph(e)}
          />
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button text={"Cancel"} onClick={onClose} />
            <Button text={"Save"} intent={Intent.PRIMARY} onClick={onSubmit} />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export const render = createOverlayRender("copy-block-alert", CopyBlockAlert);

export default CopyBlockAlert;
