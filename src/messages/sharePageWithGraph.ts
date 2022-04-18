import createBlock from "roamjs-components/writes/createBlock";
import createPage from "roamjs-components/writes/createPage";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import toRoamDateUid from "roamjs-components/date/toRoamDateUid";
import { Intent } from "@blueprintjs/core";
import { render as renderToast } from "roamjs-components/components/Toast";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import type { InputTextNode } from "roamjs-components/types";
import { notify } from "../components/NotificationContainer";
import { MessageLoaderProps } from "../components/setupMultiplayer";
import { render } from "../components/SharePageAlert";
import { v4 } from "uuid";

const load = ({ addGraphListener, sendToGraph }: MessageLoaderProps) => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Share Page With Graph",
    callback: () => {
      if (false) render({ pageUid: getCurrentPageUid() });
      else
        renderToast({
          content: "Feature is still in development. Coming Soon!",
          id: "coming-soon",
        });
    },
  });
  addGraphListener({
    operation: "SHARE_PAGE",
    handler: (e, graph) => {
      const { uid, title, tree, isPage } = e as {
        uid: string;
        title: string;
        tree: InputTextNode[];
        isPage: boolean;
      };
      notify({
        title: "Share Page",
        description: `Graph ${graph} is attempting to share page ${title}. Would you like to accept?`,
        actions: [
          {
            label: "Accept",
            callback: async () => {
              const localTitle = isPage
                ? getPageTitleByPageUid(uid)
                : getTextByBlockUid(uid);
              return (
                localTitle
                  ? Promise.all(
                      tree.map((node, order) =>
                        createBlock({ node, parentUid: uid, order })
                      )
                    ).then(() =>
                      sendToGraph({
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
                  : (isPage
                      ? createPage({ uid, title })
                      : Promise.resolve(toRoamDateUid()).then((parentUid) =>
                          createBlock({
                            node: { text: title },
                            parentUid,
                            order: getChildrenLengthByPageUid(parentUid),
                          })
                        )
                    )
                      .then(() =>
                        Promise.all(
                          tree.map((node, order) =>
                            createBlock({ node, parentUid: uid, order })
                          )
                        )
                      )
                      .then(() =>
                        sendToGraph({
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
            },
          },
          {
            label: "Reject",
            callback: async () => {
              sendToGraph({
                graph,
                operation: `SHARE_PAGE_RESPONSE`,
                data: {
                  success: false,
                },
              });
            },
          },
        ],
      });
    },
  });
  addGraphListener({
    operation: `SHARE_PAGE_RESPONSE`,
    handler: (data, graph) => {
      window.roamjs.extension.multiplayer.removeGraphListener({
        operation: `SHARE_PAGE_RESPONSE`,
      });
      const { success, uid } = data as {
        success: boolean;
        uid: string;
        tree: InputTextNode[];
        existing: boolean;
        title: string;
        isPage: boolean;
      };
      if (success)
        renderToast({
          id: "share-page-success",
          content: `Successfully shared ${uid} with ${graph}!`,
          intent: Intent.SUCCESS,
        });
      else
        renderToast({
          id: "share-page-failure",
          content: `Graph ${graph} rejected ${uid}`,
        });
    },
  });
};

export default load;
