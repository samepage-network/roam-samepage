import { sharedPages } from "../messages/sharePageWithGraph";
import { useMemo } from "react";
import PageLink from "roamjs-components/components/PageLink";
import createOverlayRender from "roamjs-components/util/createOverlayRender";
import { Dialog } from "@blueprintjs/core";

const SharedPagesDashboard = ({ onClose }: { onClose: () => void }) => {
  const pages = useMemo(
    () =>
      Array.from(sharedPages.ids).map((id) => ({
        title: window.roamAlphaAPI.data.pull("[:node/title]", id)[
          ":node/title"
        ],
        uid: sharedPages.idToUid[id],
      })),
    []
  );
  return (
    <Dialog onClose={onClose} isOpen={true} title={"Shared Pages"}>
      {pages.length ? (
        <ul>
          {pages.map(({ uid, title }) => (
            <li key={uid}>
              <PageLink uid={uid}>{title}</PageLink>
            </li>
          ))}
        </ul>
      ) : (
        <div>No pages shared yet.</div>
      )}
    </Dialog>
  );
};

export const render = createOverlayRender(
  "shared-pages-dashboard",
  SharedPagesDashboard
);

export default SharedPagesDashboard;
