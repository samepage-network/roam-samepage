import { render as renderToast } from "roamjs-components/components/Toast";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import createPage from "roamjs-components/writes/createPage";
import toRoamDateUid from "roamjs-components/date/toRoamDateUid";
import createBlock, {
  gatherActions,
} from "roamjs-components/writes/createBlock";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import { Intent } from "@blueprintjs/core";
import apiPost from "roamjs-components/util/apiPost";
import { addSharedPage, sharedPages } from "../messages/sharePageWithGraph";
import type { Action } from "../../lambdas/multiplayer_post";
import { TreeNode } from "roamjs-components/types";

const acceptSharePageResponse = async ({
  isPage,
  uid,
  graph,
  title,
  id,
}: Record<string, string>) => {
  const localTitle = isPage
    ? getPageTitleByPageUid(uid)
    : getTextByBlockUid(uid);
  return (
    localTitle
      ? Promise.resolve(getFullTreeByParentUid(uid).children)
      : isPage === "true"
      ? createPage({ uid, title }).then(() => [] as TreeNode[])
      : Promise.resolve(toRoamDateUid())
          .then((parentUid) =>
            createBlock({
              node: { text: title },
              parentUid,
              order: getChildrenLengthByPageUid(parentUid),
            })
          )
          .then(() => [] as TreeNode[])
  )
    .then((nodes) => {
      addSharedPage(uid);
      return apiPost<{ log: Action[] }>("multiplayer", {
        method: "join-shared-page",
        id,
      })
        .then((r) =>
          r.log
            .map((a) => () => window.roamAlphaAPI[a.action](a.params))
            .reduce((p, c) => p.then(c), Promise.resolve())
        )
        .then(() =>
          apiPost<{ newIndex: number }>("multiplayer", {
            method: "update-shared-page",
            graph,
            uid,
            log: nodes
              .flatMap((node, order) =>
                gatherActions({ node, order, parentUid: uid })
              )
              .map((params) => ({ params, action: "createBlock" })),
          })
        )
        .then((r) => {
          sharedPages.indices[uid] = r.newIndex;
          window.roamjs.extension.multiplayer.sendToGraph({
            graph,
            operation: `SHARE_PAGE_RESPONSE`,
            data: {
              success: true,
              uid,
              id,
            },
          });
        });
    })
    .then(() =>
      renderToast({
        id: "share-page-success",
        content: `Successfully shared page ${uid}`,
        intent: Intent.SUCCESS,
      })
    );
};

export default acceptSharePageResponse;
