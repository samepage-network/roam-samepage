import { Intent } from "@blueprintjs/core";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import { render as renderToast } from "roamjs-components/components/Toast";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import type { PullBlock, ViewType } from "roamjs-components/types";
import apiPost from "roamjs-components/util/apiPost";
import type { Action } from "../../lambdas/common/types";
import { notify } from "../components/NotificationContainer";
import {
  addAuthenticationHandler,
  removeAuthenticationHandler,
} from "../components/setupSamePageClient";
import { render } from "../components/SharePageAlert";
import { render as renderStatus } from "../components/SharedPageStatus";
import type { SharedPages, SamePageProps } from "../types";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageTitleValueByHtmlElement from "roamjs-components/dom/getPageTitleValueByHtmlElement";
import apiClient from "../apiClient";

export const sharedPages: SharedPages = {
  indices: {},
  ids: new Set(),
  idToUid: {},
};
const COMMAND_PALETTE_LABEL = "Share Page With Graph";
const AUTHENTICATED_LABEL = "LIST_SHARED_PAGES";
const SHARE_PAGE_OPERATION = "SHARE_PAGE";
const SHARE_PAGE_UPDATE_OPERATION = "SHARE_PAGE_UPDATE";
const SHARE_PAGE_RESPONSE_OPERATION = "SHARE_PAGE_RESPONSE";
const observers: Set<MutationObserver> = new Set();
const blocksObserved = new Set();

if (process.env.NODE_ENV === "development") {
  // @ts-ignore
  window.debug = {
    blocksObserved,
    sharedPages,
  };
}

// replace with Roam global listener
const blockUidWatchCallback: Parameters<
  typeof window.roamAlphaAPI.data.addPullWatch
>[2] = (before, after) => {
  const parentUid =
    sharedPages.idToUid[after[":db/id"]] ||
    sharedPages.idToUid[
      after[":block/parents"].find((node) =>
        sharedPages.ids.has(node[":db/id"])
      )[":db/id"]
    ];
  if (
    before[":block/open"] !== after[":block/open"] ||
    before[":block/string"] !== after[":block/string"] ||
    before[":block/heading"] !== after[":block/heading"] ||
    before[":block/text-align"] !== after[":block/text-align"] ||
    before[":children/view-type"] !== after[":children/view-type"]
  ) {
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
    return apiClient<{ newIndex: number }>({
      method: "update-shared-page",
      data: { uid: parentUid, log: [action] },
    }).then((r) => {
      sharedPages.indices[parentUid] = r.newIndex;
    });
  }
  const beforeChildren = before[":block/children"] || [];
  const afterChildren = after[":block/children"] || [];
  if (beforeChildren.length > afterChildren.length) {
    const alive = new Set(afterChildren.map((node) => node[":db/id"]));
    const deleted = beforeChildren
      .map((c) => c[":db/id"])
      .filter((c) => !alive.has(c))
      .map((id) => window.roamAlphaAPI.pull("[:block/uid]", id)[":block/uid"]);
    deleted.forEach(unwatchUid);
    return apiClient<{ newIndex: number }>({
      method: "update-shared-page",
      data: {
        uid: parentUid,
        log: deleted.map((d) => ({
          action: "deleteBlock",
          params: {
            block: {
              uid: d,
            },
          },
        })),
      },
    }).then((r) => {
      sharedPages.indices[parentUid] = r.newIndex;
    });
  } else if (beforeChildren.length < afterChildren.length) {
    const old = new Set(beforeChildren.map((node) => node[":db/id"]));
    const created = afterChildren
      .map((c) => c[":db/id"])
      .filter((c) => !old.has(c))
      .map((id) =>
        window.roamAlphaAPI.pull("[:block/uid :block/order :block/string]", id)
      );
    created.forEach((d) => watchUid(d[":block/uid"]));
    return apiClient<{ newIndex: number }>({
      method: "update-shared-page",
      data: {
        uid: parentUid,
        log: created.map((d) => ({
          action: "createBlock",
          params: {
            block: {
              uid: d[":block/uid"],
              string: d[":block/string"] || "",
            },
            location: {
              "parent-uid": after[":block/uid"],
              order: d[":block/order"],
            },
          },
        })),
      },
    }).then((r) => {
      sharedPages.indices[parentUid] = r.newIndex;
    });
  }
};

const watchUid = (uid: string) => {
  blocksObserved.add(uid);
  window.roamAlphaAPI.data.addPullWatch(
    "[*]",
    `[:block/uid "${uid}"]`,
    blockUidWatchCallback
  );
};

const unwatchUid = (uid: string) => {
  blocksObserved.delete(uid);
  window.roamAlphaAPI.data.removePullWatch(
    "[*]",
    `[:block/uid "${uid}"]`,
    blockUidWatchCallback
  );
};

const getDescendentUidsByParentUid = (uid: string) =>
  window.roamAlphaAPI.data.fast
    .q(
      `[:find [pull ?b [:block/uid]] :where [?p :block/uid "${uid}"] [?b :block/parents ?p]]`
    )
    .map((b) => (b[0] as PullBlock)[":block/uid"]);

const EVENT_NAME = "roamjs:samepage:shared";

export const addSharedPage = (uid: string, index = 0) => {
  sharedPages.indices[uid] = index;
  const dbId = window.roamAlphaAPI.pull(`[:db/id]`, `[:block/uid "${uid}"]`)?.[
    ":db/id"
  ];
  if (dbId) {
    sharedPages.ids.add(dbId);
    sharedPages.idToUid[dbId] = uid;
    getDescendentUidsByParentUid(uid).forEach(watchUid);
    watchUid(uid);

    const event = new CustomEvent(EVENT_NAME, { detail: uid });
    document
      .querySelectorAll("h1.rm-title-display")
      .forEach((h1) => h1.dispatchEvent(event));
  }
};

export const removeSharedPage = (uid: string) => {
  delete sharedPages.indices[uid];
  const dbId = window.roamAlphaAPI.pull(`[:db/id]`, `[:block/uid "${uid}"]`)?.[
    ":db/id"
  ];
  if (dbId) {
    sharedPages.ids.delete(dbId);
    delete sharedPages.idToUid[dbId];
    getDescendentUidsByParentUid(uid).forEach(unwatchUid);
    unwatchUid(uid);
  }
};

const load = (props: SamePageProps) => {
  const { addGraphListener } = props;
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: COMMAND_PALETTE_LABEL,
    callback: () => {
      render({ pageUid: getCurrentPageUid(), sharedPages, ...props });
    },
  });
  addAuthenticationHandler({
    label: AUTHENTICATED_LABEL,
    handler: () =>
      apiClient<{ indices: Record<string, number> }>({
        method: "list-shared-pages",
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
        apiClient<{ log: Action[]; exists: boolean }>({
          method: "get-shared-page",
          data: {
            uid,
            localIndex: sharedPages.indices[uid],
          },
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
      className: "rm-title-display",
      tag: "H1",
      callback: (h: HTMLElement) => {
        const title = getPageTitleValueByHtmlElement(h);
        const uid = getPageUidByPageTitle(title);
        const attribute = `data-roamjs-shared-${uid}`;
        const containerParent = h.parentElement?.parentElement;
        if (containerParent && !containerParent.hasAttribute(attribute)) {
          containerParent.setAttribute(attribute, "true");
          apiClient<{ log: Action[]; exists: boolean }>({
            method: "get-shared-page",
            data: {
              uid,
            },
          }).then((r) => {
            const execRender = () => {
              const parent = document.createElement("div");
              containerParent.insertBefore(
                parent,
                h.parentElement?.nextElementSibling || null
              );
              renderStatus({ parent, parentUid: uid });
            };
            if (r.exists) {
              execRender();
            } else {
              h.addEventListener(EVENT_NAME, ((e: CustomEvent) => {
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

export const unload = ({ removeGraphListener }: SamePageProps) => {
  blocksObserved.forEach(unwatchUid);
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
