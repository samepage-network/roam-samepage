import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import type {
  ViewType,
  InputTextNode,
  TreeNode,
  OnloadArgs,
} from "roamjs-components/types";
import { render as renderStatus } from "../components/SharedPageStatus";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageTitleValueByHtmlElement from "roamjs-components/dom/getPageTitleValueByHtmlElement";
import updateBlock from "roamjs-components/writes/updateBlock";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import { render as renderNotifications } from "../components/NotificationContainer";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import Automerge from "automerge";
import { loadSharePageWithNotebook } from "@samepage/client";
import type { Apps, Schema, AppId } from "@samepage/shared";
import { render as renderInitPage } from "../components/SharePageDialog";
import { render as renderViewPages } from "../components/SharedPagesDashboard";
import getUids from "roamjs-components/dom/getUids";
import { openDB } from "idb";
import createPage from "roamjs-components/writes/createPage";
import getChildrenLengthByParentUid from "roamjs-components/queries/getChildrenLengthByParentUid";

// uuids are 128 bits
// roam uids are 54 bits
// roam date uids are 60 bits
const roamUidToUuid = () => {};
const roamUuidToUid = () => {};

const openIdb = () =>
  openDB("samepage", 1, {
    upgrade(db) {
      db.createObjectStore("pages");
    },
  });

const toAtJson = ({
  nodes,
  level = 0,
  startIndex = 0,
  viewType,
}: {
  nodes: TreeNode[];
  level?: number;
  startIndex?: number;
  viewType?: ViewType;
}) => {
  const annotations: Schema["annotations"] = [];
  let index = startIndex;
  const content: string = nodes
    .map((n) => {
      const end = n.text.length + index;
      annotations.push({
        start: index,
        end,
        attributes: {
          identifier: n.uid,
          level: level,
          viewType: viewType,
        },
        type: "block",
      });
      const { content: childrenContent, annotations: childrenAnnotations } =
        toAtJson({
          nodes: n.children,
          level: level + 1,
          viewType: n.viewType || viewType,
          startIndex: end,
        });
      const nodeContent = `${n.text}${childrenContent}`;
      annotations.push(...childrenAnnotations);
      index += nodeContent.length;
      return nodeContent;
    })
    .join("");
  return {
    content,
    annotations,
  };
};

const flattenTree = <T extends { children?: T[]; uid?: string }>(
  tree: T[],
  parentUid: string
): (T & { order: number; parentUid: string })[] =>
  tree.flatMap((t, order) => [
    { ...t, order, parentUid },
    ...flattenTree(t.children || [], t.uid || ""),
  ]);

const calculateState = async (notebookPageId: string) => {
  const node = getFullTreeByParentUid(notebookPageId);
  const parentUid = getParentUidByBlockUid(notebookPageId);
  const doc = toAtJson({
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
export const notebookDbIds = new Set<number>();
const getIdByBlockUid = (uid: string) =>
  window.roamAlphaAPI.pull("[:db/id]", [":block/uid", uid])?.[":db/id"];

const setupSharePageWithNotebook = (
  extensionAPI: OnloadArgs["extensionAPI"],
  apps: Apps
) => {
  const {
    unload,
    updatePage,
    disconnectPage,
    sharePage,
    joinPage,
    rejectPage,
    forcePushPage,
    listConnectedNotebooks,
  } = loadSharePageWithNotebook({
    renderInitPage: async (args) => {
      const notebookPageId =
        await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
      renderInitPage({ notebookPageId, ...args });
    },
    renderViewPages,

    applyState: async (notebookPageId, state) => {
      const expectedTree: InputTextNode[] = [];
      const mapping: Record<string, InputTextNode> = {};
      const parents: Record<string, string> = {};
      let expectedPageViewType: ViewType = "bullet";
      let currentBlock: InputTextNode;
      let initialPromise = Promise.resolve("");
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
                initialPromise = updateBlock({
                  text: title,
                  uid: notebookPageId,
                });
              } else {
                initialPromise = window.roamAlphaAPI
                  .updatePage({
                    page: { title, uid: notebookPageId },
                  })
                  .then(() => "");
              }
            } else {
              initialPromise = Promise.resolve("");
            }
          } else {
            if (parentUid) {
              const exists = !!window.roamAlphaAPI.pull("[:db/id]", [
                ":block/uid",
                parentUid,
              ]);
              if (exists) {
                initialPromise = createBlock({
                  parentUid,
                  order: getChildrenLengthByParentUid(parentUid),
                  node: { text: title, uid: notebookPageId },
                });
              } else {
                const dnpParentUid = window.roamAlphaAPI.util.dateToPageUid(
                  new Date()
                );
                initialPromise = createBlock({
                  parentUid: dnpParentUid,
                  order: getChildrenLengthByParentUid(dnpParentUid),
                  node: { text: title, uid: notebookPageId },
                });
              }
            } else {
              initialPromise = createPage({ title, uid: notebookPageId });
            }
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
          ? () =>
              window.roamAlphaAPI.updateBlock({
                block: {
                  uid: notebookPageId,
                  "children-view-type": expectedPageViewType,
                },
              })
          : Promise.resolve("");
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
      const uidsToCreate = Object.keys(expectedTreeMapping).filter(
        (k) => !actualTreeMapping[k]
      );
      const uidsToDelete = Object.keys(actualTreeMapping).filter(
        (k) => !expectedTreeMapping[k]
      );
      const uidsToUpdate = Object.keys(expectedTreeMapping).filter(
        (k) => !!actualTreeMapping[k]
      );
      return Promise.all(
        [initialPromise, viewTypePromise]
          .concat(uidsToDelete.map((uid) => deleteBlock(uid)))
          .concat(
            uidsToCreate.map((uid) => {
              const { parentUid, order, ...node } = expectedTreeMapping[uid];
              return createBlock({ parentUid, order, node });
            })
          )
          .concat(
            uidsToUpdate.map((uid) => {
              const { parentUid, order, ...node } = expectedTreeMapping[uid];
              const actual = actualTreeMapping[uid];
              // it's possible we may need to await from above and repull
              if (actual.parentUid !== parentUid || actual.order !== order) {
                return window.roamAlphaAPI
                  .moveBlock({
                    block: { uid },
                    location: { "parent-uid": parentUid, order },
                  })
                  .then(() => "");
              } else if (actual.text !== node.text) {
                return updateBlock({ text: node.text, uid });
              } else {
                return Promise.resolve("");
              }
            })
          )
      );
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
          `${window.roamAlphaAPI.graph.name}/${notebookPageId}`,
        )
      ),
  });
  renderNotifications({
    actions: {
      accept: ({ app, workspace, notebookPageId, pageUuid }) =>
        joinPage({
          pageUuid,
          notebookPageId,
          source: { app: Number(app) as AppId, workspace },
        }),
      reject: async ({ workspace, app }) =>
        rejectPage({ source: { app: Number(app) as AppId, workspace } }),
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
      if (notebookDbIds.has(dbId)) {
        containerParent.setAttribute(attribute, "true");
        const parent = document.createElement("div");
        const h = containerParent.querySelector("h1.rm-title-display");
        containerParent.insertBefore(
          parent,
          h?.parentElement?.nextElementSibling || null
        );
        renderStatus({
          parentUid: uid,
          parent,
          sharePage,
          disconnectPage,
          forcePushPage,
          listConnectedNotebooks,
          apps,
        });
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
        notebookDbIds.has(p[":db/id"])
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
