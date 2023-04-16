import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getPageViewType from "roamjs-components/queries/getPageViewType";
import { TreeNode, ViewType } from "roamjs-components/types/native";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import updateBlock from "roamjs-components/writes/updateBlock";
import { InitialSchema } from "samepage/internal/types";
import { HandlerError } from "samepage/internal/setupMessageHandlers";
import atJsonToRoam from "./atJsonToRoam";
import isPage from "./isPage";

type SamepageNode = {
  text: string;
  level: number;
  viewType: ViewType;
  annotation: {
    start: number;
    end: number;
    annotations: InitialSchema["annotations"];
  };
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

const updateLevel = (t: TreeNodeWithLevel, level: number) => {
  t.level = level;
  (t.children || []).forEach(
    (t) => !Array.isArray(t) && updateLevel(t, level + 1)
  );
};

const applyState = async (notebookPageId: string, state: InitialSchema) => {
  const rootPageUid = isPage(notebookPageId)
    ? getPageUidByPageTitle(notebookPageId)
    : notebookPageId;
  const expectedTree: SamepageNode[] = [];
  state.annotations.forEach((anno) => {
    if (anno.type === "block") {
      const currentBlock: SamepageNode = {
        text: state.content.slice(anno.start, anno.end).replace(/\n$/, ""),
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
    block.text = atJsonToRoam({
      content: block.text,
      annotations: normalizedAnnotations,
    });
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
            parentIndex < 0
              ? rootPageUid
              : actualTree[parentIndex]?.uid || rootPageUid,
        };
      };
      if (actualTree.length > index) {
        const actualNode = actualTree[index];
        const blockUid = actualNode.uid;
        return updateBlock({ uid: blockUid, text: expectedNode.text })
          .catch((e) =>
            Promise.reject(new Error(`Failed to update block: ${e.message}`))
          )
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
                    Promise.reject(
                      new HandlerError(`Failed to move block`, {
                        message: e.message,
                        notebookPageId,
                        actualNode,
                        expectedNode,
                        parentUid,
                        order,
                      })
                    )
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
          .catch((e) =>
            Promise.reject(
              new HandlerError(
                `Failed to append block. An error report has been sent to support@samepage.network`,
                {
                  message: e.message,
                  parentUid,
                  notebookPageId,
                  pullDataAsTitle: window.roamAlphaAPI.pull("[:db/id]", [
                    ":node/title",
                    notebookPageId,
                  ]),
                  pullDataAsBlock: window.roamAlphaAPI.pull("[:db/id]", [
                    ":block/uid",
                    notebookPageId,
                  ]),
                }
              )
            )
          );
      }
    })
    .concat(
      actualTree.slice(expectedTree.length).map(
        (a) => () =>
          deleteBlock(a.uid)
            .then(() => Promise.resolve())
            .catch((e) =>
              Promise.reject(new Error(`Failed to remove block: ${e.message}`))
            )
      )
    );

  return promises.reduce((p, c) => p.then(c), Promise.resolve<unknown>(""));
};

export default applyState;
