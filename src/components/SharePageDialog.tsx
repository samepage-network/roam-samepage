import React from "react";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import GraphMessageDialog from "./GraphMessageDialog";
import type { Notebook, Apps } from "@samepage/shared";

type Props = {
  notebookPageId: string;
  apps?: Apps;
  onSubmit: (args: { notebooks: Notebook[]; notebookPageId: string }) => void;
};

const SharePageDialog = ({
  onClose,
  notebookPageId,
  apps,
  onSubmit,
}: { onClose: () => void } & Props) => {
  return (
    <>
      <GraphMessageDialog
        title={`Share Page with Graph`}
        onClose={onClose}
        onSubmit={(notebooks) =>
          Promise.resolve(onSubmit({ notebooks, notebookPageId }))
        }
        apps={apps}
      >
        <p>
          Sharing this page means that all graphs with access to it will be able
          to edit its child blocks.
        </p>
      </GraphMessageDialog>
    </>
  );
};

export const render = createOverlayRender<Props>(
  "share-page-alert",
  SharePageDialog
);

export default SharePageDialog;
