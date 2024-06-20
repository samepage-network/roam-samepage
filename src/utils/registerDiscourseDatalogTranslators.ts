import {
  DatalogAndClause,
  DatalogClause,
  DatalogVariable,
} from "roamjs-components/types";
import {
  DiscourseRelation,
  NewCondition,
  NodeType,
  RelationType,
  Translator,
  TranslatorContext,
  conditionToDatalog,
  findChildren,
  translator,
} from "./getDatalogQuery";
import compileDatalog from "./compileDatalog";
import normalizePageTitle from "roamjs-components/queries/normalizePageTitle";
import { nanoid } from "nanoid";
import { isBlockBackend } from "./isBlock";
import { isPageBackend } from "./isPage";

const ANY_RELATION_REGEX = /Has Any Relation To/i;
type ForwardType = RelationType & { forward: boolean };

const collectVariables = (
  clauses: (DatalogClause | DatalogAndClause)[]
): Set<string> =>
  new Set(
    clauses.flatMap((c) => {
      switch (c.type) {
        case "data-pattern":
        case "fn-expr":
        case "pred-expr":
        case "rule-expr":
          return [...c.arguments]
            .filter((a) => a.type === "variable")
            .map((a) => a.value);
        case "not-join-clause":
        case "or-join-clause":
        case "not-clause":
        case "or-clause":
        case "and-clause":
          return Array.from(collectVariables(c.clauses));
        default:
          return [];
      }
    })
  );

const replaceDatalogVariables = (
  replacements: (
    | { from: string; to: string }
    | { from: true; to: (v: string) => string }
  )[] = [],
  clauses: DatalogClause[]
): DatalogClause[] => {
  const replaceDatalogVariable = (a: DatalogVariable): DatalogVariable => {
    const rep = replacements.find(
      (rep) => a.value === rep.from || rep.from === true
    );
    if (!rep) {
      return { ...a };
    } else if (a.value === rep.from) {
      a.value = rep.to;
      return {
        ...a,
        value: rep.to,
      };
    } else if (rep.from === true) {
      return {
        ...a,
        value: rep.to(a.value),
      };
    }
    return a;
  };
  return clauses.map((c): DatalogClause => {
    switch (c.type) {
      case "data-pattern":
      case "fn-expr":
      case "pred-expr":
      case "rule-expr":
        return {
          ...c,
          arguments: c.arguments.map((a) => {
            if (a.type !== "variable") {
              return { ...a };
            }
            return replaceDatalogVariable(a);
          }),
          ...(c.type === "fn-expr"
            ? {
                binding:
                  c.binding.type === "bind-scalar"
                    ? {
                        variable: replaceDatalogVariable(c.binding.variable),
                        type: "bind-scalar",
                      }
                    : c.binding,
              }
            : {}),
        };
      case "not-join-clause":
      case "or-join-clause":
        return {
          ...c,
          variables: c.variables.map(replaceDatalogVariable),
          clauses: replaceDatalogVariables(replacements, c.clauses),
        };
      case "not-clause":
      case "or-clause":
      case "and-clause":
        return {
          ...c,
          clauses: replaceDatalogVariables(replacements, c.clauses),
        };
      default:
        throw new Error(`Unknown clause type: ${c["type"]}`);
    }
  });
};

// const checkRelationCondition = ({
//   type,
//   condition,
//   label,
//   context,
// }: {
//   type: RelationType;
//   condition: { source: string; target: string };
//   label: string;
//   context: TranslatorContext;
// }): ForwardType | undefined => {
//   const isLabelEqual = type.text === label;
//   const isLabelComplement = type.relation.complement === label;
//   const isAnyRelationMatch = ANY_RELATION_REGEX.test(label);
//   const relation = {
//     source: type.relation.source,
//     destination: type.relation.destination,
//   };
//   const relationFlipped = {
//     source: type.relation.destination,
//     destination: type.relation.source,
//   };

//   const labelMatch =
//     (isLabelEqual || isAnyRelationMatch) &&
//     doesDiscourseRelationMatchCondition({ relation, condition, context });
//   if (labelMatch) return { ...type, forward: true };

//   const complementMatch =
//     (isLabelComplement || isAnyRelationMatch) &&
//     doesDiscourseRelationMatchCondition({
//       relation: relationFlipped,
//       condition,
//       context,
//     });
//   if (complementMatch) return { ...type, forward: false };

//   return undefined;
// };

// type MatchNode = {
//   specification: NewCondition[];
//   text: string;
//   context: TranslatorContext;
// } & ({ title: string } | { uid: string });

// const matchDiscourseNode = ({
//   specification,
//   text,
//   context,
//   ...rest
// }: MatchNode): boolean => {
//   if (!specification.length) return false;
//   const where = replaceDatalogVariables(
//     [{ from: text, to: "node" }],
//     specification.flatMap((c) => conditionToDatalog({ condition: c, context }))
//   ).map((c) => compileDatalog(c, 0));
//   const firstClause =
//     "title" in rest
//       ? `[or-join [?node] [?node :node/title "${normalizePageTitle(
//           rest.title
//         )}"] [?node :block/string "${normalizePageTitle(rest.title)}"]]`
//       : `[?node :block/uid "${rest.uid}"]`;

//   const query = `[:find ?node :where ${firstClause} ${where.join(" ")}]`;
//   return !!window.roamAlphaAPI.data.fast.q(query).length;

//   // const title = "title" in rest ? rest.title : getPageTitleByPageUid(rest.uid);
//   // return getDiscourseNodeFormatExpression(format).test(title);
// };

// const doesDiscourseRelationMatchCondition = ({
//   relation,
//   condition,
//   context,
// }: {
//   relation: { source: string; destination: string };
//   condition: { source: string; target: string };
//   context: TranslatorContext;
// }) => {
//   const { nodeTypes } = context;
//   const nodeLabelById = Object.fromEntries(
//     nodeTypes.map((n) => [n.id, n.text])
//   );
//   const nodeById = Object.fromEntries(nodeTypes.map((n) => [n.id, n]));
//   const nodeIdByLabel = Object.fromEntries(
//     nodeTypes.map((n) => [n.text.toLowerCase(), n.id])
//   );
//   const sourceType = nodeLabelById[relation.source];
//   const targetType = nodeLabelById[relation.destination];
//   const sourceMatches =
//     sourceType === condition.source || relation.source === "*";
//   const targetNode = nodeById[relation.destination];
//   const targetMatches =
//     targetType === condition.target ||
//     relation.destination === "*" ||
//     matchDiscourseNode({
//       ...targetNode,
//       title: condition.target,
//       context,
//     }) ||
//     matchDiscourseNode({
//       ...targetNode,
//       uid: condition.target,
//       context,
//     });
//   if (sourceMatches) {
//     return (
//       targetMatches ||
//       (!nodeIdByLabel[condition.target.toLowerCase()] &&
//         !Object.values(nodeById).some(
//           (node) =>
//             matchDiscourseNode({
//               ...node,
//               title: condition.target,
//               context,
//             }) ||
//             matchDiscourseNode({
//               ...node,
//               uid: condition.target,
//               context,
//             })
//         ))
//     );
//   }
//   if (targetMatches) {
//     return sourceMatches || !nodeIdByLabel[condition.source.toLowerCase()];
//   }
//   // if both are placeholders, sourceType and targetType will both be null, meaning we could match any condition
//   return false; // !nodeLabelByType[condition.source] && !nodeLabelByType[condition.target]
// };

// const filterRelation = ({
//   label,
//   source,
//   target,
//   context,
// }: {
//   label: string;
//   source: string;
//   target: string;
//   context: TranslatorContext;
// }): ForwardType[] => {
//   const { relationTypes } = context;
//   const condition = { source, target };
//   const filterRelations = relationTypes
//     .map((type) => checkRelationCondition({ type, condition, label, context }))
//     .filter((relation): relation is ForwardType => !!relation);
//   return filterRelations;
// };

const computeEdgeTriple = ({
  nodeType,
  value,
  triple,
  context,
  uid,
}: {
  nodeType: string;
  value: string;
  triple: readonly [string, string, string];
  context: TranslatorContext;
  uid: string;
}): DatalogClause[] => {
  const { nodeTypes } = context;
  const nodeTypeByLabel = Object.fromEntries(
    nodeTypes.map((n) => [n.text.toLowerCase(), n.id])
  );
  const possibleNodeType = nodeTypeByLabel[value.toLowerCase()];
  const isBlock = isBlockBackend(value);
  if (possibleNodeType) {
    const condition = conditionToDatalog({
      // uid,
      condition: {
        target: possibleNodeType,
        relation: "is a",
        source: triple[0],
        type: "AND",
      },
      context,
    });
    return condition;
  } else if (isBlockBackend(value).then((isBlock) => isBlock)) {
    return [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: triple[0] },
          { type: "constant", value: ":block/uid" },
          { type: "constant", value: `"${value}"` },
        ],
      },
    ];
  } else if (isPageBackend(value).then((isPage) => isPage)) {
    const condition = conditionToDatalog({
      // uid,
      condition: {
        target: value,
        relation: "has title",
        source: triple[0],
        type: "AND",
      },
      context,
    });
    return condition;
  } else {
    const condition = conditionToDatalog({
      // uid,
      condition: {
        target: nodeType,
        relation: "is a",
        source: triple[0],
        type: "AND",
      },
      context,
    });
    return condition;
  }
};
const generateEdgeTriples = ({
  forward,
  source,
  target,
  sourceTriple,
  targetTriple,
  relationSource,
  relationTarget,
  context,
  uid,
}: {
  forward: boolean;
  source: string;
  target: string;
  sourceTriple: readonly [string, string, string];
  targetTriple: readonly [string, string, string];
  relationSource: string;
  relationTarget: string;
  context: TranslatorContext;
  uid: string;
}): DatalogClause[] => {
  const firstDataPatternVariable = forward ? sourceTriple[0] : targetTriple[0];
  const secondDataPatternVariable = forward ? targetTriple[0] : sourceTriple[0];
  return computeEdgeTriple({
    value: forward ? source : target,
    triple: sourceTriple,
    nodeType: relationSource,
    context,
    uid,
  })
    .concat(
      computeEdgeTriple({
        value: forward ? target : source,
        triple: targetTriple,
        nodeType: relationTarget,
        context,
        uid,
      })
    )
    .concat([
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: firstDataPatternVariable },
          { type: "constant", value: ":block/uid" },
          { type: "variable", value: `${source}-uid` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/uid" },
          { type: "variable", value: `${source}-uid` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: secondDataPatternVariable },
          { type: "constant", value: ":block/uid" },
          { type: "variable", value: `${target}-uid` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: target },
          { type: "constant", value: ":block/uid" },
          { type: "variable", value: `${target}-uid` },
        ],
      },
    ]);
};
const generateAndParts = ({
  filteredRelations,
  source,
  target,
  uid,
  context,
}: {
  filteredRelations: ForwardType[];
  source: string;
  target: string;
  uid: string;
  context: TranslatorContext;
}) => {
  return filteredRelations.map(({ relation, forward }) => {
    const {
      triples,
      source: relationSource,
      destination: relationTarget,
    } = relation;
    const sourceTriple = triples.find((t) => t[2] === "source");
    const targetTriple = triples.find(
      (t) => t[2] === "destination" || t[2] === "target"
    );
    if (!sourceTriple || !targetTriple) return [];

    const edgeTriples = generateEdgeTriples({
      forward,
      source,
      target,
      sourceTriple,
      targetTriple,
      relationSource,
      relationTarget,
      context,
      uid,
    });
    const subQuery = triples
      .filter((t) => t !== sourceTriple && t !== targetTriple)
      .flatMap(([src, rel, tar]) =>
        conditionToDatalog({
          condition: {
            type: "AND",
            source: src,
            relation: rel,
            target: tar,
          },
          context,
        })
      );
    return replaceDatalogVariables(
      [
        { from: source, to: source },
        { from: target, to: target },
        { from: true, to: (v) => `${uid}-${v}` },
      ],
      edgeTriples.concat(subQuery)
    );
  });
};

const register = ({ key, ...translation }: Translator & { key: string }) => {
  translator[key] = translation;
};
const registerDiscourseDatalogTranslator = (
  context: TranslatorContext
): null => {
  const { relationTypes, relationsInQuery } = context;

  const relationTypesWithComplementTypes = new Set(
    relationTypes.flatMap((relationType) => {
      const { ...rest } = relationType;
      const relation: RelationType = {
        ...rest,
        isComplement: false,
      };
      const swappedRelation: RelationType = {
        ...rest,
        text: relationType.relation.complement,
        isComplement: true,
      };
      return [relation, swappedRelation];
    })
  );
  const requiredRelations = Array.from(relationTypesWithComplementTypes).filter(
    ({ id }) => relationsInQuery?.some((r) => r.id === id)
  );

  requiredRelations.forEach((r) => {
    const { text, isComplement } = r;
    const isRelationInTranslator = !!translator[text];
    if (isRelationInTranslator) return null;

    register({
      key: text.toLowerCase(),
      callback: ({
        source,
        target,
        context,
        uid,
      }: {
        source: string;
        target: string;
        context: TranslatorContext;
        uid: string;
      }) => {
        const forwardType = {
          ...r,
          forward: !isComplement,
        };
        const andParts = generateAndParts({
          filteredRelations: [forwardType],
          source,
          target,
          uid,
          context,
        });
        if (andParts.length === 1) return andParts[0];

        const orJoinedVars = collectVariables(andParts[0]);
        andParts.slice(1).forEach((a) => {
          const freeVars = collectVariables(a);
          Array.from(orJoinedVars).forEach((v) => {
            if (!freeVars.has(v)) orJoinedVars.delete(v);
          });
        });
        return [
          {
            type: "or-join-clause",
            variables: Array.from(orJoinedVars).map((v) => ({
              type: "variable",
              value: v,
            })),
            clauses: andParts.map((a) => ({
              type: "and-clause",
              clauses: a,
            })),
          },
        ];
      },
    });
  });

  return null;
};

export default registerDiscourseDatalogTranslator;
