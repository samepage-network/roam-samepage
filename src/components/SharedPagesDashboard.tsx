import { sharedPages } from "../messages/sharePageWithGraph";
import { useMemo } from "react";
import PageLink from "roamjs-components/components/PageLink";

const SharedPagesDashboard = () => {
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
  return pages.length ? (
    <ul>
      {pages.map(({ uid, title }) => (
        <li key={uid}>
          <PageLink uid={uid}>{title}</PageLink>
        </li>
      ))}
    </ul>
  ) : (
    <div>No pages shared yet.</div>
  );
};

export default SharedPagesDashboard;
