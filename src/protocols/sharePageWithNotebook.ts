import type { Schema, InitialSchema } from "samepage/internal/types";
import loadSharePageWithNotebook from "samepage/protocols/sharePageWithNotebook";
import atJsonParser from "samepage/utils/atJsonParser";
import type {
  ViewType,
  TreeNode,
  OnloadArgs,
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
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getPageTitleByBlockUid from "roamjs-components/queries/getPageTitleByBlockUid";
import openBlockInSidebar from "roamjs-components/writes/openBlockInSidebar";
import Automerge from "automerge";
import blockGrammar from "../utils/blockGrammar";
import getPageViewType from "roamjs-components/queries/getPageViewType";
import nanoid from "nanoid";
import atJsonToRoam from "../utils/atJsonToRoam";

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
      const { content: _content, annotations } = n.text
        ? atJsonParser(blockGrammar, n.text)
        : {
            content: String.fromCharCode(0),
            annotations: [],
          };
      const content = `${_content || String.fromCharCode(0)}\n`;
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

// TODO - Remove this when we have more testing
// we should have reference to parents.length
type TreeNodeWithLevel = Omit<TreeNode, "children"> & {
  level: number;
  children: TreeNodeWithLevel[];
};

// In Roam, the view type of a block is actually determined by its parent.
const flattenTree = (
  tree: TreeNode[],
  level: number,
  viewType: ViewType
): TreeNodeWithLevel[] => {
  return tree.flatMap((t) => {
    const children = flattenTree(t.children, level + 1, t.viewType || viewType);
    return [{ ...t, level, viewType, children }, ...children];
  });
};

const calculateState = (notebookPageId: string) => {
  const pageUid = getPageUidByPageTitle(notebookPageId);
  const node = getFullTreeByParentUid(pageUid);
  return toAtJson({
    nodes: node.children,
    viewType: node.viewType || "bullet",
  });
};

const updateLevel = (t: TreeNodeWithLevel, level: number) => {
  t.level = level;
  (t.children || []).forEach(
    (t) => !Array.isArray(t) && updateLevel(t, level + 1)
  );
};

type SamepageNode = {
  text: string;
  level: number;
  viewType: ViewType;
  annotation: {
    start: number;
    end: number;
    annotations: Schema["annotations"];
  };
};

export const applyState = async (
  notebookPageId: string,
  state: Schema,
  onloadArgs: OnloadArgs
) => {
  const rootPageUid = getPageUidByPageTitle(notebookPageId);
  const expectedTree: SamepageNode[] = [];
  state.annotations.forEach((anno) => {
    if (anno.type === "block") {
      const currentBlock: SamepageNode = {
        text: state.content
          .slice(anno.start, anno.end)
          .join("")
          .replace(/\n$/, ""),
        level: anno.attributes.level,
        viewType: anno.attributes.viewType,
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
    block.text = atJsonToRoam(
      { content: block.text, annotations: normalizedAnnotations },
      onloadArgs
    );
  });
  const pageViewType = getPageViewType(notebookPageId);
  const actualTree = flattenTree(
    getFullTreeByParentUid(rootPageUid).children,
    1,
    pageViewType
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
          .then(async () => {
            if ((actualNode.level || 0) !== expectedNode.level) {
              const { parentUid, order } = getLocation();
              if (parentUid) {
                await window.roamAlphaAPI
                  .moveBlock({
                    location: { "parent-uid": parentUid, order },
                    block: { uid: actualNode.uid },
                  })
                  .then(() => {
                    updateLevel(actualNode, expectedNode.level);
                    actualNode.order = order;
                  })
                  .catch((e) =>
                    Promise.reject(`Failed to move block: ${e.message}`)
                  );
              }
            }
            if (actualNode.viewType !== expectedNode.viewType) {
              // we'll want to resolve this some how
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
          .then((uid) => {
            const newActualNode = getFullTreeByParentUid(uid);
            actualTree.push({
              ...newActualNode,
              level: newActualNode.parents.length,
              children: [],
            });
          })
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

const setupSharePageWithNotebook = (onloadArgs: OnloadArgs) => {
  const {
    unload,
    updatePage,
    isShared,
  } = loadSharePageWithNotebook({
    getCurrentNotebookPageId: () =>
      window.roamAlphaAPI.ui.mainWindow
        .getOpenPageOrBlockUid()
        .then((uid) =>
          uid
            ? getPageTitleByPageUid(uid)
            : window.roamAlphaAPI.util.dateToPageTitle(new Date())
        ),
    createPage: (title) => createPage({ title }),
    openPage: (title) =>
      window.roamAlphaAPI.ui.mainWindow.openPage({
        page: { title },
      }),
    deletePage: (title) =>
      window.roamAlphaAPI.deletePage({
        page: { title },
      }),
    doesPageExist: async (title) =>
      !!window.roamAlphaAPI.pull("[:db/id]", [":node/title", title]),
    applyState: async (...args) => applyState(...args, onloadArgs),
    calculateState: async (...args) => calculateState(...args),
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
      sharedPageStatusProps: {
        getHtmlElement: async (notebookPageId) => {
          return Array.from(
            document.querySelectorAll<HTMLHeadingElement>("h1.rm-title-display")
          ).find((h) => getPageTitleValueByHtmlElement(h) === notebookPageId);
        },
        selector: "h1.rm-title-display",
        getNotebookPageId: async (el) => elToTitle(el as Element),
        getPath: (heading) => {
          const parent = heading?.parentElement?.parentElement;
          const sel = nanoid();
          parent.setAttribute("data-samepage-shared", sel);
          return `div[data-samepage-shared="${sel}"]::before(1)`;
        },
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
    label,
    blockUid,
    notebookPageId,
    pull = "[*]",
  }: {
    label: string;
    blockUid: string;
    notebookPageId: string;
    pull?: string;
  }) => {
    refreshRef = [
      pull,
      `[:block/uid "${blockUid}"]`,
      async () => {
        clearRefreshRef();
        const doc = calculateState(notebookPageId);
        updatePage({
          notebookPageId,
          label,
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
    if (/^Alt/.test(e.key)) return;
    if (/^Escape/.test(e.key)) return;
    if (el.tagName === "TEXTAREA" && el.classList.contains("rm-block-input")) {
      const { blockUid } = getUids(el as HTMLTextAreaElement);
      const notebookPageId = getPageTitleByBlockUid(blockUid);
      if (isShared(notebookPageId)) {
        clearRefreshRef();
        refreshState({
          label: `Edit Block - ${blockUid}`,
          blockUid,
          notebookPageId,
          pull: "[:block/string :block/parents]",
        });
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
        refreshState({
          blockUid,
          notebookPageId,
          pull: "[:block/string]",
          label: "Paste",
        });
      }
    }
  };
  document.body.addEventListener("paste", bodyPasteListener);

  const dragEndListener = (e: DragEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "SPAN" && el.classList.contains("rm-bullet")) {
      const { blockUid } = getUids(
        el
          .closest(".rm-block-main")
          .querySelector(".roam-block, .rm-block-text")
      );
      if (blockUid) {
        const notebookPageId = getPageTitleByBlockUid(blockUid);
        if (isShared(notebookPageId)) {
          clearRefreshRef();
          refreshState({ blockUid, notebookPageId, label: "Drag Block" });
        }
      }
    }
  };
  document.body.addEventListener("dragend", dragEndListener);

  return () => {
    clearRefreshRef();
    document.body.removeEventListener("keydown", bodyKeydownListener);
    document.body.removeEventListener("paste", bodyPasteListener);
    document.body.removeEventListener("dragend", dragEndListener);
    unload();
  };
};

export default setupSharePageWithNotebook;
