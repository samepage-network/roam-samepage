import React from "react";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import GraphMessageDialog from "./GraphMessageDialog";

type Props = {
  pageUid: string;
  apps?: { id: number; name: string }[];
  onSubmit: (args: {
    app: number;
    workspace: string;
    notebookPageId: string;
  }) => void;
};

const SharePageDialog = ({
  onClose,
  pageUid,
  apps = [],
  onSubmit,
}: { onClose: () => void } & Props) => {
  return (
    <>
      <GraphMessageDialog
        title={`Share Page with Graph`}
        onClose={onClose}
        onSubmitToGraph={(graph) =>
          Promise.resolve(
            onSubmit({ app: 1, workspace: graph, notebookPageId: pageUid })
          )
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
