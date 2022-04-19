import { render as renderToast } from "roamjs-components/components/Toast";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import createPage from "roamjs-components/writes/createPage";
import toRoamDateUid from "roamjs-components/date/toRoamDateUid";
import createBlock from "roamjs-components/writes/createBlock";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import { Intent } from "@blueprintjs/core";

const acceptSharePageResponse = async ({
  isPage,
  uid,
  graph,
  title,
}: Record<string, string>) => {
  const localTitle = isPage
    ? getPageTitleByPageUid(uid)
    : getTextByBlockUid(uid);
  return (
    localTitle
      ? Promise.resolve(
          window.roamjs.extension.multiplayer.sendToGraph({
            graph,
            operation: `SHARE_PAGE_RESPONSE`,
            data: {
              success: true,
              tree: getFullTreeByParentUid(uid),
              existing: true,
              title: localTitle,
              uid,
              isPage,
            },
          })
        )
      : (isPage === "true"
          ? createPage({ uid, title })
          : Promise.resolve(toRoamDateUid()).then((parentUid) =>
              createBlock({
                node: { text: title },
                parentUid,
                order: getChildrenLengthByPageUid(parentUid),
              })
            )
        ).then(() =>
          window.roamjs.extension.multiplayer.sendToGraph({
            graph,
            operation: `SHARE_PAGE_RESPONSE`,
            data: {
              success: true,
              existing: false,
              uid,
              isPage,
            },
          })
        )
  ).then(() =>
    renderToast({
      id: "share-page-success",
      content: `Successfully shared page ${uid}`,
      intent: Intent.SUCCESS,
    })
  );
};

export default acceptSharePageResponse;
