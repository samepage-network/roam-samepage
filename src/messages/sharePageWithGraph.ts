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
  removeAuthenticationHandler,
  MessageLoaderProps,
} from "../components/setupMultiplayer";
import { render } from "../components/SharePageAlert";
import { render as renderStatus } from "../components/SharedPageStatus";
import { SharedPages } from "../types";
import getUids from "roamjs-components/dom/getUids";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageTitleValueByHtmlElement from "roamjs-components/dom/getPageTitleValueByHtmlElement";

export const sharedPages: SharedPages = {
  indices: {},
  ids: new Set(),
  idToUid: {},
};

export const addSharedPage = (uid: string, index = 0) => {
  sharedPages.indices[uid] = index;
  const dbId = window.roamAlphaAPI.pull(`[:db/id]`, `[:block/uid "${uid}"]`)?.[
    ":db/id"
  ];
  if (dbId) {
    sharedPages.ids.add(dbId);
    sharedPages.idToUid[dbId] = uid;
  }
  const event = new CustomEvent("roamjs:multiplayer:shared", { detail: uid });
  document
    .querySelectorAll("h1.rm-title-display")
    .forEach((h1) => h1.dispatchEvent(event));
};

const COMMAND_PALETTE_LABEL = "Share Page With Graph";
const AUTHENTICATED_LABEL = "LIST_SHARED_PAGES";
const SHARE_PAGE_OPERATION = "SHARE_PAGE";
const SHARE_PAGE_UPDATE_OPERATION = "SHARE_PAGE_UPDATE";
const SHARE_PAGE_RESPONSE_OPERATION = "SHARE_PAGE_RESPONSE";
const observers: Set<MutationObserver> = new Set();
const blocksObserved = new Set();

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
        graph: window.roamAlphaAPI.graph.name,
        uid: parentUid,
        log: [action],
      }).then((r) => {
        sharedPages.indices[parentUid] = r.newIndex;
      });
    });
};

const load = ({ addGraphListener }: MessageLoaderProps) => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: COMMAND_PALETTE_LABEL,
    callback: () => {
      render({ pageUid: getCurrentPageUid(), sharedPages });
    },
  });
  addAuthenticationHandler({
    label: AUTHENTICATED_LABEL,
    handler: () =>
      apiPost<{ indices: Record<string, number> }>("multiplayer", {
        method: "list-shared-pages",
        graph: window.roamAlphaAPI.graph.name,
      }).then((r) => {
        const { indices } = r;
        Object.keys(indices).forEach((uid) => addSharedPage(uid, indices[uid]));
      }),
  });
  addGraphListener({
    operation: SHARE_PAGE_OPERATION,
    handler: (e, graph) => {
      const { uid, title, isPage, id } = e as {
        uid: string;
        title: string;
        isPage: boolean;
        id: string;
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
              id,
            },
          },
          {
            label: "Reject",
            method: "reject share page response",
            args: { graph, id },
          },
        ],
      });
    },
  });
  addGraphListener({
    operation: SHARE_PAGE_RESPONSE_OPERATION,
    handler: (data, graph) => {
      const { success, uid } = data as {
        success: boolean;
        uid: string;
      };
      if (success)
        apiPost<{ log: Action[]; exists: boolean }>("multiplayer", {
          method: "get-shared-page",
          graph: window.roamAlphaAPI.graph.name,
          uid,
          localIndex: sharedPages.indices[uid],
        })
          .then((r) =>
            !r.exists
              ? Promise.reject(
                  new Error(`There is no live shared page linked to uid ${uid}`)
                )
              : r.log
                  .map((a) => () => window.roamAlphaAPI[a.action](a.params))
                  .reduce((p, c) => p.then(c), Promise.resolve())
          )
          .then(() =>
            renderToast({
              id: "share-page-success",
              content: `Successfully shared ${uid} with ${graph}!`,
              intent: Intent.SUCCESS,
            })
          )
          .catch((e) =>
            renderToast({
              id: "share-page-failure",
              content: `Error: ${e.message}`,
              intent: Intent.DANGER,
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
    operation: SHARE_PAGE_UPDATE_OPERATION,
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

  observers.add(
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
        blocksObserved.add(blockUid);
      },
      removeCallback: (t: HTMLTextAreaElement) => {
        const { blockUid } = getUids(t);
        window.roamAlphaAPI.data.removePullWatch(
          "[*]",
          `[:block/uid "${blockUid}"]`,
          blockUidWatchCallback
        );
        blocksObserved.delete(blockUid);
      },
    })
  );

  observers.add(
    createHTMLObserver({
      className: "rm-title-display",
      tag: "H1",
      callback: (h: HTMLElement) => {
        const title = getPageTitleValueByHtmlElement(h);
        const uid = getPageUidByPageTitle(title);
        const attribute = `data-roamjs-shared-${uid}`;
        const containerParent = h.parentElement?.parentElement;
        if (containerParent && !containerParent.hasAttribute(attribute)) {
          containerParent.setAttribute(attribute, "true");
          apiPost<{ log: Action[]; exists: boolean }>("multiplayer", {
            method: "get-shared-page",
            graph: window.roamAlphaAPI.graph.name,
            uid,
          }).then((r) => {
            const execRender = () => {
              const parent = document.createElement("div");
              containerParent.insertBefore(
                parent,
                h.parentElement?.nextElementSibling || null
              );
              renderStatus({ parent });
            };
            if (r.exists) {
              execRender();
            } else {
              h.addEventListener("roamjs:multiplayer:shared", ((
                e: CustomEvent
              ) => {
                if (e.detail === uid) {
                  execRender();
                }
              }) as EventListener);
            }
          });
        }
      },
    })
  );
};

export const unload = ({ removeGraphListener }: MessageLoaderProps) => {
  blocksObserved.forEach((blockUid) =>
    window.roamAlphaAPI.data.removePullWatch(
      "[*]",
      `[:block/uid "${blockUid}"]`,
      blockUidWatchCallback
    )
  );
  blocksObserved.clear();
  observers.forEach((o) => o.disconnect());
  removeGraphListener({ operation: SHARE_PAGE_RESPONSE_OPERATION });
  removeGraphListener({ operation: SHARE_PAGE_UPDATE_OPERATION });
  removeGraphListener({ operation: SHARE_PAGE_OPERATION });
  removeAuthenticationHandler(AUTHENTICATED_LABEL);
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: COMMAND_PALETTE_LABEL,
  });
};

export default load;
