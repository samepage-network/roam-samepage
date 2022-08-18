import PageLink from "roamjs-components/components/PageLink";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { Classes, Dialog } from "@blueprintjs/core";

type Props = { notebookPageIds: string[] };

const SharedPagesDashboard = ({
  onClose,
  notebookPageIds,
}: {
  onClose: () => void;
  notebookPageIds: string[];
}) => {
  return (
    <Dialog
      onClose={onClose}
      isOpen={true}
      title={"Shared Pages"}
      autoFocus={false}
      enforceFocus={false}
    >
      <div className={Classes.DIALOG_BODY}>
        {notebookPageIds.length ? (
          <ul>
            {notebookPageIds.map((uid) => (
              <li key={uid}>
                <PageLink uid={uid} />
              </li>
            ))}
          </ul>
        ) : (
          <div>No pages shared yet.</div>
        )}
      </div>
    </Dialog>
  );
};

export const render = createOverlayRender<Props>(
  "shared-pages-dashboard",
  SharedPagesDashboard
);

export default SharedPagesDashboard;
