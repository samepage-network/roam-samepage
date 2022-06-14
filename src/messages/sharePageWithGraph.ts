import { Intent } from "@blueprintjs/core";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import { render as renderToast } from "roamjs-components/components/Toast";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import type { ViewType } from "roamjs-components/types";
import apiPost from "roamjs-components/util/apiPost";
import type { Action } from "../../lambdas/multiplayer_post";
import { notify } from "../components/NotificationContainer";
import {
  addAuthenticationHandler,
  MessageLoaderProps,
} from "../components/setupMultiplayer";
import { render } from "../components/SharePageAlert";
import { SharedPages } from "../types";
import getUids from "roamjs-components/dom/getUids";
import getGraph from "roamjs-components/util/getGraph";

export const sharedPages: SharedPages = {
  indices: {},
  ids: new Set(),
  idToUid: {},
};

export const addSharedPage = (uid: string, index = 0) => {
  sharedPages.indices[uid] = index;
  const dbId = window.roamAlphaAPI.data.fast.q(
    `[:find ?b :where [?b :block/uid "${uid}"]]`
  )?.[0]?.[0] as number;
  if (dbId) {
    sharedPages.ids.add(
      window.roamAlphaAPI.data.fast.q(
        `[:find ?b :where [?b :block/uid "${uid}"]]`
      )?.[0]?.[0] as number
    );
    sharedPages.idToUid[dbId] = uid;
  }
};

const load = ({ addGraphListener }: MessageLoaderProps) => {
  const graph = getGraph();
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Share Page With Graph",
    callback: () => {
      render({ pageUid: getCurrentPageUid(), sharedPages });
    },
  });
  addAuthenticationHandler(() =>
    apiPost<{ indices: Record<string, number> }>("multiplayer", {
      method: "list-shared-pages",
      graph: getGraph(),
    }).then((r) => {
      const { indices } = r;
      Object.keys(indices).forEach((uid) => addSharedPage(uid, indices[uid]));
    })
  );
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
        apiPost<{ log: Action[] }>("multiplayer", { method: "get-shared-page" })
          .then((r) =>
            r.log
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
  addGraphListener({
    operation: "SHARE_PAGE_UPDATE",
    handler: (data) => {
      const { log, uid, index } = data as {
        log: Action[];
        uid: string;
        index: number;
      };
      log
        .map(
          ({ action, params }) =>
            () =>
              window.roamAlphaAPI[action](params)
        )
        .reduce((p, c) => p.then(c), Promise.resolve())
        .then(() => (sharedPages.indices[uid] = index));
    },
  });

  // replace with Roam global listener
  const blockUidWatchCallback: Parameters<
    typeof window.roamAlphaAPI.data.addPullWatch
  >[2] = (_, after) => {
    after[":block/parents"]
      .filter((a) => sharedPages.ids.has(a[":db/id"]))
      .map((parent) => {
        const action: Action = {
          action: "updateBlock",
          params: {
            block: {
              string: after[":block/string"],
              open: after[":block/open"],
              heading: after[":block/heading"],
              "children-view-type": after[":children/view-type"]
                ? (after[":children/view-type"].slice(1) as ViewType)
                : undefined,
              "text-align": after[":block/text-align"],
              uid: after[":block/uid"],
            },
          },
        };
        const parentUid = sharedPages.idToUid[parent[":db/id"]];
        return apiPost<{ newIndex: number }>("multiplayer", {
          method: "update-shared-page",
          graph,
          uid: parentUid,
          log: [action],
        }).then((r) => {
          sharedPages.indices[parentUid] = r.newIndex;
        });
      });
  };

  createHTMLObserver({
    tag: "TEXTAREA",
    className: "rm-block-input",
    callback: (t: HTMLTextAreaElement) => {
      const { blockUid } = getUids(t);
      window.roamAlphaAPI.data.addPullWatch(
        "[*]",
        `[:block/uid "${blockUid}"]`,
        blockUidWatchCallback
      );
    },
    removeCallback: (t: HTMLTextAreaElement) => {
      const { blockUid } = getUids(t);
      window.roamAlphaAPI.data.removePullWatch(
        "[*]",
        `[:block/uid "${blockUid}"]`,
        blockUidWatchCallback
      );
    },
  });
};

export default load;
