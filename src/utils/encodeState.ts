import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import { PullBlock, TreeNode, ViewType } from "roamjs-components/types";
import { SamePageSchema } from "samepage/internal/types";
import blockParser from "./blockParser";
import isBlock from "./isBlock";

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
}): SamePageSchema => {
  return nodes
    .map((n) => (index: number) => {
      const { content: _content, annotations } = n.text
        ? blockParser(n.text)
        : {
            content: String.fromCharCode(0),
            annotations: [],
          };
      const content = `${_content || String.fromCharCode(0)}\n`;
      const end = content.length + index;
      const blockAnnotation: SamePageSchema["annotations"] = [
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
        annotations: [] as SamePageSchema["annotations"],
      }
    );
};

const get$Body = (pageUid: string): SamePageSchema => {
  const node = getFullTreeByParentUid(pageUid);
  return toAtJson({
    nodes: node.children,
    viewType: node.viewType || "bullet",
  });
};

const encodeState = async (notebookPageId: string) => {
  const pageUid = isBlock(notebookPageId)
    ? notebookPageId
    : getPageUidByPageTitle(notebookPageId);
  const node = getFullTreeByParentUid(pageUid);

  const { [":entity/attrs"]: attrs = [], [":attrs/lookup"]: lookup = [] } =
    window.roamAlphaAPI.pull("[:entity/attrs :attrs/lookup]", [
      ":block/uid",
      pageUid,
    ]) || {};
  const attrLookup = Object.fromEntries(
    lookup
      .filter((l): l is PullBlock => ":block/uid" in l)
      .map((l) => [
        l[":block/uid"],
        l[":node/title"] || l[":block/string"]?.trim(),
      ])
  );
  const attributes = Object.fromEntries(
    attrs.map((e) => {
      const key = attrLookup[e[1][":value"][1]];
      const rawValue = e[2][":value"];
      const value =
        typeof rawValue === "string"
          ? blockParser(rawValue.trim())
          : get$Body(rawValue[1]);
      return [key, value];
    })
  );
  return {
    $title: blockParser(node.text),
    $body: get$Body(pageUid),
    ...attributes,
  };
};

export default encodeState;
