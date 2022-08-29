import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import type {
  ViewType,
  InputTextNode,
  TreeNode,
  PullBlock,
} from "roamjs-components/types/native";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageTitleValueByHtmlElement from "roamjs-components/dom/getPageTitleValueByHtmlElement";
import updateBlock from "roamjs-components/writes/updateBlock";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import NotificationContainer from "@samepage/client/components/NotificationContainer";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import Automerge from "automerge";
import loadSharePageWithNotebook from "@samepage/client/protocols/sharePageWithNotebook";
import SharedPageStatus from "@samepage/client/components/SharedPageStatus";
import type { Schema, AppId, Apps } from "@samepage/shared";
import { render as renderViewPages } from "../components/SharedPagesDashboard";
import getUids from "roamjs-components/dom/getUids";
import { openDB, IDBPDatabase } from "idb";
import createPage from "roamjs-components/writes/createPage";
import { v4 } from "uuid";
import renderOverlay from "roamjs-components/util/renderOverlay";
import renderWithUnmount from "roamjs-components/util/renderWithUnmount";
import React from "react";
import getChildrenLengthByParentUid from "roamjs-components/queries/getChildrenLengthByParentUid";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import getSubTree from "roamjs-components/util/getSubTree";

const roamToSamepage = (s: string) =>
  openIdb()
    .then((db) => db.get("roam-to-samepage", s))
    .then((v) => (v as string) || "");
const samepageToRoam = (s: string) =>
  openIdb()
    .then((db) => db.get("samepage-to-roam", s))
    .then((v) => (v as string) || "");
const saveUid = (roam: string, samepage: string) =>
  openIdb().then((db) =>
    Promise.all([
      db.put("roam-to-samepage", samepage, roam),
      db.put("samepage-to-roam", roam, samepage),
    ])
  );
const removeUid = (roam: string, samepage: string) =>
  openIdb().then((db) =>
    Promise.all([
      db.delete("roam-to-samepage", roam),
      db.delete("samepage-to-roam", samepage),
    ])
  );
const removeRoamUid = (roam: string) =>
  roamToSamepage(roam).then((samepage) => removeUid(roam, samepage));

let db: IDBPDatabase;
const openIdb = async () =>
  db ||
  (db = await openDB("samepage", 2, {
    upgrade(db) {
      const names = new Set(db.objectStoreNames);
      ["pages", "roam-to-samepage", "samepage-to-roam"]
        .filter((s) => !names.has(s))
        .forEach((s) => db.createObjectStore(s));
    },
  }));

const toAtJson = async ({
  nodes,
  level = 0,
  startIndex = 0,
  viewType,
}: {
  nodes: TreeNode[];
  level?: number;
  startIndex?: number;
  viewType?: ViewType;
}): Promise<Omit<Schema, "contentType">> => {
  return nodes
    .map(
      (n) => (index: number) =>
        roamToSamepage(n.uid)
          .then(
            (identifier) =>
              identifier ||
              Promise.resolve(v4()).then((samepageUuid) =>
                saveUid(n.uid, samepageUuid).then(() => samepageUuid)
              )
          )
          .then(async (identifier) => {
            const end = n.text.length + index;
            const annotations: Schema["annotations"] = [
              {
                start: index,
                end,
                attributes: {
                  identifier,
                  level: level,
                  viewType: viewType,
                },
                type: "block",
              },
            ];
            const {
              content: childrenContent,
              annotations: childrenAnnotations,
            } = await toAtJson({
              nodes: n.children,
              level: level + 1,
              viewType: n.viewType || viewType,
              startIndex: end,
            });
            return {
              content: new Automerge.Text(`${n.text}${childrenContent}`),
              annotations: annotations.concat(childrenAnnotations),
            };
          })
    )
    .reduce(
      (p, c) =>
        p.then(({ content: pc, annotations: pa }) =>
          c(startIndex + pc.length).then(
            ({ content: cc, annotations: ca }) => ({
              content: new Automerge.Text(`${pc}${cc}`),
              annotations: pa.concat(ca),
            })
          )
        ),
      Promise.resolve({
        content: new Automerge.Text(""),
        annotations: [] as Schema["annotations"],
      })
    );
};

const flattenTree = <T extends { children?: T[]; uid?: string }>(
  tree: T[],
  parentUid: string
): (Omit<T, "children"> & { order: number; parentUid: string })[] =>
  tree.flatMap(({ children = [], ...t }, order) => [
    { ...t, order, parentUid },
    ...flattenTree(children, t.uid || ""),
  ]);

const calculateState = async (notebookPageId: string) => {
  const node = getFullTreeByParentUid(notebookPageId);
  const parentUid = getParentUidByBlockUid(notebookPageId);
  const doc = await toAtJson({
    nodes: node.children,
    viewType: node.viewType || "bullet",
    startIndex: node.text.length,
  });
  return {
    content: new Automerge.Text(`${node.text}${doc.content}`),
    annotations: (
      [
        {
          start: 0,
          end: node.text.length,
          type: "metadata",
          attributes: {
            title: node.text,
            parent: parentUid,
          },
        },
      ] as Schema["annotations"]
    ).concat(doc.annotations),
  };
};

export const STATUS_EVENT_NAME = "roamjs:samepage:status";
export const notebookPageIds = new Set<number>();
const getIdByBlockUid = (uid: string) =>
  window.roamAlphaAPI.pull("[:db/id]", [":block/uid", uid])?.[":db/id"];

const setupSharePageWithNotebook = (apps: Apps) => {
  const {
    unload,
    updatePage,
    disconnectPage,
    joinPage,
    rejectPage,
    forcePushPage,
    listConnectedNotebooks,
    getLocalHistory,
  } = loadSharePageWithNotebook({
    renderViewPages,

    getCurrentNotebookPageId: window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid,
    applyState: async (notebookPageId, state) => {
      const expectedTree: InputTextNode[] = [];
      const mapping: Record<string, InputTextNode> = {};
      const parents: Record<string, string> = {};
      let expectedPageViewType: ViewType = "bullet";
      let currentBlock: InputTextNode;
      let initialPromise = () => Promise.resolve("");
      const insertAtLevel = (
        nodes: InputTextNode[],
        level: number,
        parentUid: string
      ) => {
        if (level === 0 || nodes.length === 0) {
          nodes.push(currentBlock);
          parents[currentBlock.uid] = parentUid;
        } else {
          const parentNode = nodes[nodes.length - 1];
          insertAtLevel(parentNode.children, level - 1, parentNode.uid);
        }
      };
      state.annotations.forEach((anno) => {
        if (anno.type === "block") {
          currentBlock = {
            text: state.content.slice(anno.start, anno.end).join(""),
            children: [],
            uid: anno.attributes["identifier"],
          };
          mapping[currentBlock.uid] = currentBlock;
          insertAtLevel(expectedTree, anno.attributes["level"], notebookPageId);
          const parentUid = parents[currentBlock.uid];
          const viewType = anno.attributes["viewType"];
          if (parentUid === notebookPageId) {
            expectedPageViewType = viewType;
          } else mapping[parentUid].viewType = viewType;
        } else if (anno.type === "metadata") {
          const title = anno.attributes.title;
          const parentUid = anno.attributes.parent;
          const node = window.roamAlphaAPI.pull("[:node/title :block/string]", [
            ":block/uid",
            notebookPageId,
          ]);
          if (node) {
            const existingTitle = node[":node/title"] || node[":block/string"];
            if (existingTitle !== title) {
              if (parentUid) {
                initialPromise = () => updateBlock({
                  text: title,
                  uid: notebookPageId,
                });
              } else {
                initialPromise = () => window.roamAlphaAPI
                  .updatePage({
                    page: { title, uid: notebookPageId },
                  })
                  .then(() => "");
              }
            } else {
              initialPromise = () => Promise.resolve("");
            }
          } else {
            throw new Error(`Missing page with uid: ${notebookPageId}`);
          }
        }
      });
      const actualPageViewType = (
        window.roamAlphaAPI.pull("[:children/view-type]", [
          ":block/uid",
          notebookPageId,
        ])?.[":children/view-type"] || ":bullet"
      ).slice(1);
      const viewTypePromise =
        expectedPageViewType !== actualPageViewType
          ? () => window.roamAlphaAPI.updateBlock({
              block: {
                uid: notebookPageId,
                "children-view-type": expectedPageViewType,
              },
            })
          : () => Promise.resolve("");
      const expectedTreeMapping = Object.fromEntries(
        flattenTree(expectedTree, notebookPageId).map(({ uid, ...n }) => [
          uid,
          n,
        ])
      );
      const actualTreeMapping = Object.fromEntries(
        flattenTree(
          getFullTreeByParentUid(notebookPageId).children,
          notebookPageId
        ).map(({ uid, ...n }) => [uid, n])
      );
      const expectedSamepageToRoam = await Promise.all(
        Object.keys(expectedTreeMapping).map((k) =>
          samepageToRoam(k).then((r) => [k, r] as const)
        )
      ).then((keys) => Object.fromEntries(keys));
      const uidsToCreate = Object.entries(expectedSamepageToRoam).filter(
        ([, k]) => !k || !actualTreeMapping[k]
      );
      const expectedUids = new Set(
        Object.values(expectedSamepageToRoam).filter((r) => !r)
      );
      const uidsToDelete = Object.keys(actualTreeMapping).filter((k) =>
        expectedUids.has(k)
      );
      const uidsToUpdate = Object.entries(expectedSamepageToRoam).filter(
        ([, k]) => !!actualTreeMapping[k]
      );
      // REDUCE
      const promises = (
        ([initialPromise, viewTypePromise] as (() => Promise<unknown>)[])
          .concat(
            uidsToDelete.map((uid) => () =>
              deleteBlock(uid).then(() => removeRoamUid(uid))
            )
          )
          .concat(
            uidsToCreate.map(([samepageUuid, roamUid]) => () => {
              const { parentUid, order, ...input } =
                expectedTreeMapping[samepageUuid];
              const node = roamUid ? { ...input, uid: roamUid } : input;
              return (
                parentUid === notebookPageId
                  ? createBlock({
                      parentUid,
                      order,
                      node,
                    })
                  : createBlock({
                      parentUid: expectedSamepageToRoam[parentUid],
                      order,
                      node,
                    })
              ).then(
                (newRoamUid) =>
                  !roamUid &&
                  saveUid(newRoamUid, samepageUuid).then(
                    () => (expectedSamepageToRoam[samepageUuid] = newRoamUid)
                  )
              );
            })
          )
          .concat(
            uidsToUpdate.map(([samepageUuid, roamUid]) => () => {
              const {
                parentUid: samepageParentUuid,
                order,
                ...node
              } = expectedTreeMapping[samepageUuid];
              const parentUid =
                samepageParentUuid === notebookPageId
                  ? samepageParentUuid
                  : expectedSamepageToRoam[samepageParentUuid];
              const actual = actualTreeMapping[roamUid];
              return Promise.all([
                actual.parentUid !== parentUid || actual.order !== order
                  ? window.roamAlphaAPI.moveBlock({
                      block: { uid: roamUid },
                      location: { "parent-uid": parentUid, order },
                    })
                  : Promise.resolve(),
                actual.text !== node.text
                  ? updateBlock({ text: node.text, uid: roamUid })
                  : Promise.resolve(),
              ]);
            })
          )
      );
      return promises.reduce((p, c) => p.then(c), Promise.resolve<unknown>(""));
    },
    calculateState,
    loadState: async (notebookPageId) =>
      openIdb().then((db) =>
        db.get("pages", `${window.roamAlphaAPI.graph.name}/${notebookPageId}`)
      ),
    saveState: async (notebookPageId, state) =>
      openIdb().then((db) =>
        db.put(
          "pages",
          state,
          `${window.roamAlphaAPI.graph.name}/${notebookPageId}`
        )
      ),
    removeState: async (notebookPageId) =>
      openIdb().then((db) =>
        db.delete(
          "pages",
          `${window.roamAlphaAPI.graph.name}/${notebookPageId}`
        )
      ),
  });
  renderOverlay({
    Overlay: NotificationContainer,
    props: {
      actions: {
        accept: ({ app, workspace, pageUuid }) =>
          // TODO support block or page tree as a user action
          createPage({ title: pageUuid }).then((notebookPageId) =>
            joinPage({
              pageUuid,
              notebookPageId,
              source: { app: Number(app) as AppId, workspace },
            })
              .then(() => {
                const todayUid = window.roamAlphaAPI.util.dateToPageUid(
                  new Date()
                );
                const order = getChildrenLengthByParentUid(todayUid);
                return createBlock({
                  node: {
                    text: `Accepted page [[${getPageTitleByPageUid(
                      notebookPageId
                    )}]] from ${apps[Number(app)].name} / ${workspace}`,
                  },
                  parentUid: todayUid,
                  order,
                }).then(() => Promise.resolve());
              })
              .catch((e) => {
                window.roamAlphaAPI.deletePage({
                  page: { uid: notebookPageId },
                });
                return Promise.reject(e);
              })
          ),
        reject: async ({ workspace, app }) =>
          rejectPage({ source: { app: Number(app) as AppId, workspace } }),
      },
      api: {
        addNotification: (not) =>
          createPage({
            title: `samepage/notifications/${not.uuid}`,
            tree: [
              { text: "Title", children: [{ text: not.title }] },
              { text: "Description", children: [{ text: not.description }] },
              {
                text: "Actions",
                children: not.actions.map((a) => ({
                  text: a.label,
                  children: [
                    { text: "Method", children: [{ text: a.method }] },
                    {
                      text: "Args",
                      children: Object.entries(a.args).map((arg) => ({
                        text: arg[0],
                        children: [{ text: arg[1] }],
                      })),
                    },
                  ],
                })),
              },
            ],
          }),
        deleteNotification: (uuid) =>
          window.roamAlphaAPI.deletePage({ page: { uid: uuid } }),
        getNotifications: async () => {
          const pages = window.roamAlphaAPI.data.fast
            .q(
              `[:find (pull ?b [:block/uid :node/title]) :where [?b :node/title ?title] [(clojure.string/starts-with? ?title  "samepage/notifications/")]]`
            )
            .map((r) => r[0] as PullBlock);
          return pages.map((block) => {
            const tree = getBasicTreeByParentUid(block[":block/uid"]);
            return {
              title: getSettingValueFromTree({
                tree,
                key: "Title",
              }),
              uuid: block[":node/title"].replace(
                /^samepage\/notifications\//,
                ""
              ),
              description: getSettingValueFromTree({
                tree,
                key: "Description",
              }),
              actions: getSubTree({
                tree,
                key: "Actions",
              }).children.map((act) => ({
                label: act.text,
                method: getSettingValueFromTree({
                  tree: act.children,
                  key: "Method",
                }),
                args: Object.fromEntries(
                  getSubTree({ key: "Args", tree: act.children }).children.map(
                    (arg) => [arg.text, arg.children[0]?.text]
                  )
                ),
              })),
            };
          });
        },
      },
    },
  });

  const renderStatusUnderHeading = (
    isTargeted: (uid: string) => boolean,
    h: HTMLHeadingElement
  ) => {
    const title = getPageTitleValueByHtmlElement(h);
    const uid = getPageUidByPageTitle(title);
    if (!isTargeted(uid)) return;
    const attribute = `data-roamjs-shared-${uid}`;
    const containerParent = h.parentElement?.parentElement;
    if (containerParent && !containerParent.hasAttribute(attribute)) {
      const dbId = getIdByBlockUid(uid);
      if (notebookPageIds.has(dbId)) {
        containerParent.setAttribute(attribute, "true");
        const parent = document.createElement("div");
        const h = containerParent.querySelector("h1.rm-title-display");
        containerParent.insertBefore(
          parent,
          h?.parentElement?.nextElementSibling || null
        );
        const unmount = renderWithUnmount(
          React.createElement(SharedPageStatus, {
            notebookPageId: uid,
            disconnectPage: (id) =>
              disconnectPage(id).then(() => {
                notebookPageIds.delete(
                  window.roamAlphaAPI.pull("[:db/id]", [":block/uid", id])?.[
                    ":db/id"
                  ]
                );
                unmount();
              }),
            forcePushPage,
            listConnectedNotebooks,
            getLocalHistory,
          }),
          parent
        );
      }
    }
  };
  const titleObserver = createHTMLObserver({
    className: "rm-title-display",
    tag: "H1",
    callback: (h: HTMLHeadingElement) => {
      renderStatusUnderHeading(() => true, h);
    },
  });
  const statusListener = (e: CustomEvent) => {
    const uid = e.detail as string;
    Array.from(
      document.querySelectorAll<HTMLHeadingElement>("h1.rm-title-display")
    ).forEach((header) => {
      renderStatusUnderHeading((u) => u === uid, header);
    });
  };
  document.body.addEventListener(STATUS_EVENT_NAME, statusListener);
  let updateTimeout = 0;
  const bodyListener = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "TEXTAREA" && el.classList.contains("rm-block-input")) {
      const { blockUid } = getUids(el as HTMLTextAreaElement);
      const parents =
        window.roamAlphaAPI.pull("[:block/parents]", [
          ":block/uid",
          blockUid,
        ])?.[":block/parents"] || [];
      const notebookPage = parents.find((p) =>
        notebookPageIds.has(p[":db/id"])
      )?.[":db/id"];
      if (notebookPage) {
        window.clearTimeout(updateTimeout);
        updateTimeout = window.setTimeout(async () => {
          const notebookPageId = window.roamAlphaAPI.pull(
            "[:block/uid]",
            notebookPage
          )?.[":block/uid"];
          const doc = await calculateState(notebookPageId);
          updatePage({
            notebookPageId,
            label: `keydown-${e.key}`,
            callback: (oldDoc) => {
              oldDoc.content = doc.content;
              if (!oldDoc.annotations) oldDoc.annotations = [];
              oldDoc.annotations.splice(0, oldDoc.annotations.length);
              doc.annotations.forEach((a) => oldDoc.annotations.push(a));
            },
          });
          // if (e.key === "Enter") {
          //   // createBlock
          // } else if (e.key === "Backspace") {
          //   // check for deleteBlock, other wise update block
          // } else if (e.key === "Tab") {
          //   // moveBlock
          // } else {
          //   // updateBlock
          // }
        }, 1000);
      }
    }
  };
  document.body.addEventListener("keydown", bodyListener);

  return () => {
    window.clearTimeout(updateTimeout);
    document.body.removeEventListener("keydown", bodyListener);
    document.body.removeEventListener(STATUS_EVENT_NAME, statusListener);
    titleObserver.disconnect();
    unload();
  };
};

export default setupSharePageWithNotebook;
