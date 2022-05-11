import { Intent } from "@blueprintjs/core";
import { render as renderToast } from "roamjs-components/components/Toast";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import type { InputTextNode } from "roamjs-components/types";
import apiPost from "roamjs-components/util/apiPost";
import type { Action } from "../../lambdas/multiplayer_post";
import { notify } from "../components/NotificationContainer";
import { MessageLoaderProps } from "../components/setupMultiplayer";
import { render } from "../components/SharePageAlert";
import { SharedPages } from "../types";

export const sharedPages: SharedPages = {};

const load = ({ addGraphListener, sendToGraph }: MessageLoaderProps) => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Share Page With Graph",
    callback: () => {
      if (false) render({ pageUid: getCurrentPageUid(), sharedPages });
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
      const { uid, title, isPage } = e as {
        uid: string;
        title: string;
        isPage: boolean;
      };
      notify({
        title: "Share Page",
        description: `Graph ${graph} is attempting to share page ${title}. Would you like to accept?`,
        actions: [
          {
            label: "Accept",
            method: "accept share page response",
            args: {
              isPage: `${isPage}`,
              uid,
              graph,
              title,
            },
          },
          {
            label: "Reject",
            method: "reject share page response",
            args: { graph },
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
      };
      if (success)
        apiPost("multiplayer", { method: "get-shared-page" })
          .then((r) =>
            (r.data as { log: Action[] }).log
              .map((a) => () => window.roamAlphaAPI[a.action](a.params))
              .reduce((p, c) => p.then(c), Promise.resolve())
          )
          .then(() =>
            renderToast({
              id: "share-page-success",
              content: `Successfully shared ${uid} with ${graph}!`,
              intent: Intent.SUCCESS,
            })
          );
      else
        renderToast({
          id: "share-page-failure",
          content: `Graph ${graph} rejected ${uid}`,
        });
    },
  });
};

export default load;
