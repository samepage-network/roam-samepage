import type { Schema, AppId, InitialSchema } from "samepage/types";
import loadSharePageWithNotebook from "samepage/protocols/sharePageWithNotebook";
import atJsonParser from "samepage/utils/atJsonParser";
import { apps } from "samepage/internal/registry";
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
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import getUids from "roamjs-components/dom/getUids";
import createPage from "roamjs-components/writes/createPage";
import getChildrenLengthByParentUid from "roamjs-components/queries/getChildrenLengthByParentUid";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import getSubTree from "roamjs-components/util/getSubTree";
import getParentUidsOfBlockUid from "roamjs-components/queries/getParentUidsOfBlockUid";
import openBlockInSidebar from "roamjs-components/writes/openBlockInSidebar";
import Automerge from "automerge";
import { openDB, IDBPDatabase } from "idb";
import { v4 } from "uuid";
import blockGrammar from "../utils/blockGrammar";

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
}): Promise<InitialSchema> => {
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
            const { content, annotations } = atJsonParser(blockGrammar, n.text);
            const end = content.length + index;
            const blockAnnotation: Schema["annotations"] = [
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
    )
    .reduce(
      (p, c) =>
        p.then(({ content: pc, annotations: pa }) =>
          c(startIndex + pc.length).then(
            ({ content: cc, annotations: ca }) => ({
              content: `${pc}${cc}`,
              annotations: pa.concat(ca),
            })
          )
        ),
      Promise.resolve({
        content: "",
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

const applyState = async (notebookPageId: string, state: Schema) => {
  const expectedTree: InputTextNode[] = [];
  const mapping: Record<string, InputTextNode> = {};
  const contentAnnotations: Record<
    string,
    { start: number; end: number; annotations: Schema["annotations"] }
  > = {};
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
      contentAnnotations[currentBlock.uid] = {
        start: anno.start,
        end: anno.end,
        annotations: [],
      };
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
            initialPromise = () =>
              updateBlock({
                text: title,
                uid: notebookPageId,
              });
          } else {
            initialPromise = () =>
              window.roamAlphaAPI
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
    } else {
      const contentAnnotation = Object.values(contentAnnotations).find(
        (ca) => ca.start <= anno.start && anno.end <= ca.end
      );
      if (contentAnnotation) {
        contentAnnotation.annotations.push(anno);
      }
    }
  });
  Object.entries(contentAnnotations).forEach(
    ([blockUid, contentAnnotation]) => {
      const block = mapping[blockUid];
      const offset = contentAnnotation.start;
      const normalizedAnnotations = contentAnnotation.annotations.map((a) => ({
        ...a,
        start: a.start - offset,
        end: a.end - offset,
      }));
      const annotatedText = normalizedAnnotations.reduce((p, c, index, all) => {
        const appliedAnnotation =
          c.type === "bold"
            ? {
                prefix: "**",
                suffix: `**`,
              }
            : c.type === "highlighting"
            ? {
                prefix: "^^",
                suffix: `^^`,
              }
            : c.type === "italics"
            ? {
                prefix: "__",
                suffix: `__`,
              }
            : c.type === "strikethrough"
            ? {
                prefix: "~~",
                suffix: `~~`,
              }
            : c.type === "link"
            ? {
                prefix: "[",
                suffix: `](${c.attributes.href})`,
              }
            : { prefix: "", suffix: "" };
        all.slice(index + 1).forEach((a) => {
          a.start +=
            (a.start >= c.start ? appliedAnnotation.prefix.length : 0) +
            (a.start >= c.end ? appliedAnnotation.suffix.length : 0);
          a.end +=
            (a.end >= c.start ? appliedAnnotation.prefix.length : 0) +
            (a.end > c.end ? appliedAnnotation.suffix.length : 0);
        });
        return `${p.slice(0, c.start)}${appliedAnnotation.prefix}${p.slice(
          c.start,
          c.end
        )}${appliedAnnotation.suffix}${p.slice(c.end)}`;
      }, block.text);
      block.text = annotatedText;
    }
  );
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
      : () => Promise.resolve("");
  const expectedTreeMapping = Object.fromEntries(
    flattenTree(expectedTree, notebookPageId).map(({ uid, ...n }) => [uid, n])
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
    Object.values(expectedSamepageToRoam).filter((r) => !!r)
  );
  const uidsToDelete = Object.keys(actualTreeMapping).filter(
    (k) => !expectedUids.has(k)
  );
  const uidsToUpdate = Object.entries(expectedSamepageToRoam).filter(
    ([, k]) => !!actualTreeMapping[k]
  );
  // REDUCE
  const promises = (
    [initialPromise, viewTypePromise] as (() => Promise<unknown>)[]
  )
    .concat(
      uidsToDelete.map(
        (uid) => () => deleteBlock(uid).then(() => removeRoamUid(uid))
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
    );
  return promises.reduce((p, c) => p.then(c), Promise.resolve<unknown>(""));
};

const setupSharePageWithNotebook = () => {
  const {
    unload,
    updatePage,
    joinPage,
    rejectPage,
    isShared,
  } = loadSharePageWithNotebook({
    getCurrentNotebookPageId:
      window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid,
    applyState,
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
    overlayProps: {
      viewSharedPageProps: {
        getLocalPageTitle: async (uid) => getPageTitleByPageUid(uid),
        onLinkClick: (uid, e) => {
          if (e.shiftKey) {
            openBlockInSidebar(uid);
          } else {
            window.roamAlphaAPI.ui.mainWindow.openPage({ page: { uid } });
          }
        },
        linkClassName: "rm-page-ref",
        linkNewPage: (_, title) => createPage({ title }),
      },
      notificationContainerProps: {
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
          reject: async ({ workspace, app, pageUuid }) =>
            rejectPage({
              source: { app: Number(app) as AppId, workspace },
              pageUuid,
            }),
        },
        api: {
          addNotification: (not) =>
            createPage({
              title: `samepage/notifications/${not.uuid}`,
              tree: [
                { text: "Title", children: [{ text: not.title }] },
                { text: "Description", children: [{ text: not.description }] },
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
        getHtmlElement: async (uid) => {
          const title = getPageTitleByPageUid(uid);
          return Array.from(
            document.querySelectorAll<HTMLHeadingElement>("h1.rm-title-display")
          ).find((h) => getPageTitleValueByHtmlElement(h) === title);
        },
        selector: "h1.rm-title-display",
        getNotebookPageId: async (el) =>
          getPageUidByPageTitle(getPageTitleValueByHtmlElement(el)),
        getPath: (heading) => heading?.parentElement?.parentElement,
      },
    },
  });
  let updateTimeout = 0;
  const bodyListener = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "TEXTAREA" && el.classList.contains("rm-block-input")) {
      const { blockUid } = getUids(el as HTMLTextAreaElement);
      const parents = getParentUidsOfBlockUid(blockUid);
      const notebookPageId = parents.find(isShared);
      if (notebookPageId) {
        window.clearTimeout(updateTimeout);
        updateTimeout = window.setTimeout(async () => {
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
        }, 1000);
      }
    }
  };
  document.body.addEventListener("keydown", bodyListener);

  return () => {
    window.clearTimeout(updateTimeout);
    document.body.removeEventListener("keydown", bodyListener);
    unload();
  };
};

export default setupSharePageWithNotebook;
