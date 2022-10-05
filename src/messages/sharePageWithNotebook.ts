import type { Schema, AppId, InitialSchema } from "samepage/types";
import loadSharePageWithNotebook from "samepage/protocols/sharePageWithNotebook";
import atJsonParser from "samepage/utils/atJsonParser";
import apps from "samepage/internal/apps";
import type {
  ViewType,
  TreeNode,
  PullBlock,
} from "roamjs-components/types/native";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageTitleValueByHtmlElement from "roamjs-components/dom/getPageTitleValueByHtmlElement";
import updateBlock from "roamjs-components/writes/updateBlock";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import elToTitle from "roamjs-components/dom/elToTitle";
import getUids from "roamjs-components/dom/getUids";
import createPage from "roamjs-components/writes/createPage";
import getChildrenLengthByParentUid from "roamjs-components/queries/getChildrenLengthByParentUid";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import getSubTree from "roamjs-components/util/getSubTree";
import getPageTitleByBlockUid from "roamjs-components/queries/getPageTitleByBlockUid";
import openBlockInSidebar from "roamjs-components/writes/openBlockInSidebar";
import Automerge from "automerge";
import { openDB, IDBPDatabase } from "idb";
import blockGrammar from "../utils/blockGrammar";
import renderAtJson from "samepage/utils/renderAtJson";

let db: IDBPDatabase;
const openIdb = async () =>
  db ||
  (db = await openDB("samepage", 3, {
    upgrade(db) {
      const names = new Set(db.objectStoreNames);
      ["pages"]
        .filter((s) => !names.has(s))
        .forEach((s) => db.createObjectStore(s));
    },
  }));

const toAtJson = ({
  nodes,
  level = 1,
  startIndex = 0,
  viewType,
}: {
  nodes: TreeNode[];
  level?: number;
  startIndex?: number;
  viewType?: ViewType;
}): InitialSchema => {
  return nodes
    .map((n) => (index: number) => {
      const { content, annotations } = n.text
        ? atJsonParser(blockGrammar, n.text)
        : {
            content: String.fromCharCode(0),
            annotations: [],
          };
      const end = content.length + index;
      const blockAnnotation: Schema["annotations"] = [
        {
          start: index,
          end,
          attributes: {
            level: level,
            viewType: viewType,
          },
          type: "block",
        },
      ];
      const { content: childrenContent, annotations: childrenAnnotations } =
        toAtJson({
          nodes: n.children,
          level: level + 1,
          viewType: n.viewType || viewType,
          startIndex: end,
        });
      return {
        content: `${content}${childrenContent}`,
        annotations: blockAnnotation
          .concat(
            annotations.map((a) => ({
              ...a,
              start: a.start + index,
              end: a.end + index,
            }))
          )
          .concat(childrenAnnotations),
      };
    })
    .reduce(
      ({ content: pc, annotations: pa }, c) => {
        const { content: cc, annotations: ca } = c(startIndex + pc.length);
        return {
          content: `${pc}${cc}`,
          annotations: pa.concat(ca),
        };
      },
      {
        content: "",
        annotations: [] as Schema["annotations"],
      }
    );
};

const flattenTree = <T extends { children?: T[] }>(
  tree: T[],
  level: number
): (Omit<T, "children"> & { level: number })[] =>
  tree.flatMap(({ children = [], ...t }) => [
    { ...t, level },
    ...flattenTree(children, level + 1),
  ]);

const calculateState = (notebookPageId: string) => {
  const pageUid = getPageUidByPageTitle(notebookPageId);
  const node = getFullTreeByParentUid(pageUid);
  return toAtJson({
    nodes: node.children,
    viewType: node.viewType || "bullet",
  });
};

type SamepageNode = {
  text: string;
  level: number;
  annotation: {
    start: number;
    end: number;
    annotations: Schema["annotations"];
  };
};

const applyState = async (notebookPageId: string, state: Schema) => {
  const rootPageUid = getPageUidByPageTitle(notebookPageId);
  const expectedTree: SamepageNode[] = [];
  state.annotations.forEach((anno) => {
    if (anno.type === "block") {
      const currentBlock: SamepageNode = {
        text: state.content.slice(anno.start, anno.end).join(""),
        level: anno.attributes.level,
        annotation: {
          start: anno.start,
          end: anno.end,
          annotations: [],
        },
      };
      expectedTree.push(currentBlock);
    } else {
      const block = expectedTree.find(
        (ca) =>
          ca.annotation.start <= anno.start && anno.end <= ca.annotation.end
      );
      if (block) {
        block.annotation.annotations.push(anno);
      }
    }
  });
  expectedTree.forEach((block) => {
    const offset = block.annotation.start;
    const normalizedAnnotations = block.annotation.annotations.map((a) => ({
      ...a,
      start: a.start - offset,
      end: a.end - offset,
    }));
    block.text = renderAtJson({
      state: { content: block.text, annotations: normalizedAnnotations },
      applyAnnotation: {
        bold: {
          prefix: "**",
          suffix: `**`,
        },
        highlighting: {
          prefix: "^^",
          suffix: `^^`,
        },
        italics: {
          prefix: "__",
          suffix: `__`,
        },
        strikethrough: {
          prefix: "~~",
          suffix: `~~`,
        },
        link: ({ href }) => ({
          prefix: "[",
          suffix: `](${href})`,
        }),
        image: ({ src }) => ({ prefix: "![", suffix: `](${src})` }),
      },
    });
  });
  const actualTree = flattenTree(
    getFullTreeByParentUid(rootPageUid).children,
    1
  );
  const promises = expectedTree
    .map((expectedNode, index) => () => {
      const getLocation = () => {
        const parentIndex =
          expectedNode.level === 1
            ? -1
            : actualTree
                .slice(0, index)
                .map((node, originalIndex) => ({
                  level: node.level,
                  originalIndex,
                }))
                .reverse()
                .concat([{ level: 0, originalIndex: -1 }])
                .find(({ level }) => level < expectedNode.level)?.originalIndex;
        const order = expectedTree
          .slice(Math.max(0, parentIndex), index)
          .filter((e) => e.level === expectedNode.level).length;
        return {
          order,
          parentUid:
            parentIndex < 0 ? rootPageUid : actualTree[parentIndex]?.uid || "",
        };
      };
      if (actualTree.length > index) {
        const actualNode = actualTree[index];
        const blockUid = actualNode.uid;
        return updateBlock({ uid: blockUid, text: expectedNode.text })
          .catch((e) => Promise.reject(`Failed to update block: ${e.message}`))
          .then(() => {
            if ((actualNode.level || 0) !== expectedNode.level) {
              const { parentUid, order } = getLocation();
              if (parentUid) {
                return window.roamAlphaAPI
                  .moveBlock({
                    location: { "parent-uid": parentUid, order },
                    block: { uid: actualNode.uid },
                  })
                  .then(() => {
                    actualNode.level = expectedNode.level;
                    actualNode.order = order;
                  })
                  .catch((e) =>
                    Promise.reject(`Failed to move block: ${e.message}`)
                  );
              }
            }
            actualNode.text = expectedNode.text;
            return Promise.resolve();
          });
      } else {
        const { parentUid, order } = getLocation();

        return createBlock({
          parentUid,
          order,
          node: { text: expectedNode.text },
        })
          .then(() => Promise.resolve())
          .catch((e) => Promise.reject(`Failed to append block: ${e.message}`));
      }
    })
    .concat(
      actualTree.slice(expectedTree.length).map(
        (a) => () =>
          deleteBlock(a.uid)
            .then(() => Promise.resolve())
            .catch((e) =>
              Promise.reject(`Failed to remove block: ${e.message}`)
            )
      )
    );

  return promises.reduce((p, c) => p.then(c), Promise.resolve<unknown>(""));
};

export let granularChanges = { enabled: false };

const setupSharePageWithNotebook = () => {
  const {
    unload,
    updatePage,
    joinPage,
    rejectPage,
    isShared,
    insertContent,
    // refreshContent,
    deleteContent,
  } = loadSharePageWithNotebook({
    getCurrentNotebookPageId: () =>
      window.roamAlphaAPI.ui.mainWindow
        .getOpenPageOrBlockUid()
        .then((uid) =>
          uid
            ? getPageTitleByPageUid(uid)
            : window.roamAlphaAPI.util.dateToPageTitle(new Date())
        ),
    applyState,
    calculateState: async (...args) => calculateState(...args),
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
    overlayProps: {
      viewSharedPageProps: {
        onLinkClick: (notebookPageId, e) => {
          if (e.shiftKey) {
            openBlockInSidebar(getPageUidByPageTitle(notebookPageId));
          } else {
            window.roamAlphaAPI.ui.mainWindow.openPage({
              page: { title: notebookPageId },
            });
          }
        },
        linkClassName: "rm-page-ref",
        linkNewPage: (_, title) => createPage({ title }),
      },
      notificationContainerProps: {
        actions: {
          accept: ({ app, workspace, pageUuid, title }) =>
            // TODO support block or page tree as a user action
            createPage({ title }).then((rootPageUid) =>
              joinPage({
                pageUuid,
                notebookPageId: title,
              })
                .then(() => {
                  const todayUid = window.roamAlphaAPI.util.dateToPageUid(
                    new Date()
                  );
                  const order = getChildrenLengthByParentUid(todayUid);
                  return createBlock({
                    node: {
                      text: `Accepted page [[${title}]] from ${
                        apps[Number(app)].name
                      } / ${workspace}`,
                    },
                    parentUid: todayUid,
                    order,
                  }).then(() => Promise.resolve());
                })
                .catch((e) => {
                  window.roamAlphaAPI.deletePage({
                    page: { uid: rootPageUid },
                  });
                  return Promise.reject(e);
                })
            ),
          reject: async ({ title }) =>
            rejectPage({
              notebookPageId: title,
            }),
        },
        api: {
          addNotification: (not) =>
            createPage({
              title: `samepage/notifications/${not.uuid}`,
              tree: [
                { text: "Title", children: [{ text: not.title }] },
                {
                  text: "Description",
                  children: [{ text: not.description }],
                },
                {
                  text: "Buttons",
                  children: not.buttons.map((a) => ({
                    text: a,
                  })),
                },
                {
                  text: "Data",
                  children: Object.entries(not.data).map((arg) => ({
                    text: arg[0],
                    children: [{ text: arg[1] }],
                  })),
                },
              ],
            }),
          deleteNotification: (uuid) =>
            window.roamAlphaAPI.deletePage({
              page: {
                uid: getPageUidByPageTitle(`samepage/notifications/${uuid}`),
              },
            }),
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
                buttons: getSubTree({
                  tree,
                  key: "Buttons",
                }).children.map((act) => act.text),
                data: Object.fromEntries(
                  getSubTree({ key: "Data", tree }).children.map((arg) => [
                    arg.text,
                    arg.children[0]?.text,
                  ])
                ),
              };
            });
          },
        },
      },
      sharedPageStatusProps: {
        getHtmlElement: async (notebookPageId) => {
          return Array.from(
            document.querySelectorAll<HTMLHeadingElement>("h1.rm-title-display")
          ).find((h) => getPageTitleValueByHtmlElement(h) === notebookPageId);
        },
        selector: "h1.rm-title-display",
        getNotebookPageId: async (el) => elToTitle(el as Element),
        getPath: (heading) => heading?.parentElement?.parentElement,
      },
    },
  });
  let refreshRef:
    | Parameters<typeof window.roamAlphaAPI.data.addPullWatch>
    | undefined;
  const clearRefreshRef = () => {
    if (refreshRef) {
      window.roamAlphaAPI.data.removePullWatch(...refreshRef);
      refreshRef = undefined;
    }
  };
  const refreshState = ({
    blockUid,
    notebookPageId,
  }: {
    blockUid: string;
    notebookPageId: string;
  }) => {
    refreshRef = [
      "[:block/string]",
      `[:block/uid "${blockUid}"]`,
      async () => {
        clearRefreshRef();
        const doc = calculateState(notebookPageId);
        updatePage({
          notebookPageId,
          label: `Refresh`,
          callback: (oldDoc) => {
            oldDoc.content.deleteAt?.(0, oldDoc.content.length);
            oldDoc.content.insertAt?.(0, ...new Automerge.Text(doc.content));
            if (!oldDoc.annotations) oldDoc.annotations = [];
            oldDoc.annotations.splice(0, oldDoc.annotations.length);
            doc.annotations.forEach((a) => oldDoc.annotations.push(a));
          },
        });
        // refreshContent();
      },
    ];
    window.roamAlphaAPI.data.addPullWatch(...refreshRef);
  };
  const bodyKeydownListener = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (e.metaKey) return;
    if (/^Arrow/.test(e.key)) return;
    if (/^Shift/.test(e.key)) return;
    if (el.tagName === "TEXTAREA" && el.classList.contains("rm-block-input")) {
      const { blockUid } = getUids(el as HTMLTextAreaElement);
      const notebookPageId = getPageTitleByBlockUid(blockUid);
      if (isShared(notebookPageId)) {
        const { selectionStart, selectionEnd } = el as HTMLTextAreaElement;
        clearRefreshRef();
        const getBlockAnnotationStart = () => {
          const { annotations } = calculateState(notebookPageId);
          const blockUids = (
            window.roamAlphaAPI.pull("[:block/uid {:block/children ...}]", [
              ":node/title",
              notebookPageId,
            ])?.[":block/children"] || []
          ).flatMap(function flat(b: PullBlock): string[] {
            return [b[":block/uid"]].concat(
              (b[":block/children"] || []).flatMap(flat)
            );
          });
          const index = blockUids.indexOf(blockUid);
          return index >= 0
            ? annotations.filter((b) => b.type === "block")[index]?.start || 0
            : 0;
        };
        if (granularChanges.enabled && /^[a-zA-Z0-9 ]$/.test(e.key)) {
          const index =
            Math.min(selectionStart, selectionEnd) + getBlockAnnotationStart();
          (selectionStart !== selectionEnd
            ? deleteContent({
                notebookPageId,
                index,
                count: Math.abs(selectionEnd - selectionStart),
              })
            : Promise.resolve()
          ).then(() =>
            insertContent({
              notebookPageId,
              content: e.key,
              index,
            })
          );
        } else if (granularChanges.enabled && /^Backspace$/.test(e.key)) {
          const index =
            Math.min(selectionStart, selectionEnd) + getBlockAnnotationStart();
          deleteContent({
            notebookPageId,
            index: selectionEnd === selectionStart ? index - 1 : index,
            count:
              selectionEnd === selectionStart
                ? 1
                : Math.abs(selectionEnd - selectionStart),
          });
        } else {
          refreshState({ blockUid, notebookPageId });
        }
      }
    }
  };
  document.body.addEventListener("keydown", bodyKeydownListener);
  const bodyPasteListener = (e: ClipboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "TEXTAREA" && el.classList.contains("rm-block-input")) {
      const { blockUid } = getUids(el as HTMLTextAreaElement);
      const notebookPageId = getPageTitleByBlockUid(blockUid);
      if (isShared(notebookPageId)) {
        clearRefreshRef();
        refreshState({ blockUid, notebookPageId });
      }
    }
  };
  document.body.addEventListener("paste", bodyPasteListener);

  return () => {
    clearRefreshRef();
    document.body.removeEventListener("keydown", bodyKeydownListener);
    document.body.removeEventListener("paste", bodyPasteListener);
    unload();
  };
};

export default setupSharePageWithNotebook;
