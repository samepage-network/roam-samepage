import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import { TreeNode, ViewType } from "roamjs-components/types";
import { SamePageSchema, SamePageState } from "samepage/internal/types";
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

const ATTRIBUTE_REGEX = /^([^:]+)::(.*)/;
const encodeState = async (notebookPageId: string): Promise<SamePageState> => {
  const pageUid = isBlock(notebookPageId)
    ? notebookPageId
    : getPageUidByPageTitle(notebookPageId);
  const node = getFullTreeByParentUid(pageUid);

  const nodes = node.children.filter((n) => !ATTRIBUTE_REGEX.test(n.text));
  const properties = Object.fromEntries(
    node.children
      .filter((c) => ATTRIBUTE_REGEX.test(c.text))
      .map((c) => {
        const match = c.text.match(ATTRIBUTE_REGEX);
        return [match[1], blockParser(match[2])] as const;
      })
  );
  return {
    $title: blockParser(node.text),
    $body: toAtJson({
      nodes,
      viewType: node.viewType || "bullet",
    }),
    ...properties,
  };
};

export default encodeState;
