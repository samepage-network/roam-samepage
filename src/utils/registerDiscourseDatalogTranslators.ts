import {
  DatalogAndClause,
  DatalogClause,
  DatalogVariable,
} from "roamjs-components/types";
import {
  DiscourseRelation,
  RelationType,
  Translator,
  TranslatorContext,
  conditionToDatalog,
  translator,
} from "./getDatalogQuery";
import { nanoid } from "nanoid";
import { isBlockBackend } from "./isBlock";
import { isPageBackend } from "./isPage";

const ANY_RELATION_REGEX = /Has Any Relation To/i;
type CombinedRelationType = {
  text: string;
  id: string;
  relation: DiscourseRelation[];
  isComplement?: boolean;
};
type ForwardType = DiscourseRelation & { forward: boolean };

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

const computeEdgeTriple = ({
  nodeType,
  value,
  triple,
  context,
}: {
  nodeType: string;
  value: string;
  triple: readonly [string, string, string];
  context: TranslatorContext;
}): DatalogClause[] => {
  const { nodeTypes } = context;
  const nodeTypeByLabel = Object.fromEntries(
    nodeTypes.map((n) => [n.text.toLowerCase(), n.id])
  );
  const possibleNodeType = nodeTypeByLabel[value.toLowerCase()];
  if (possibleNodeType) {
    const condition = conditionToDatalog({
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
}: {
  forward: boolean;
  source: string;
  target: string;
  sourceTriple: readonly [string, string, string];
  targetTriple: readonly [string, string, string];
  relationSource: string;
  relationTarget: string;
  context: TranslatorContext;
}): DatalogClause[] => {
  const firstDataPatternVariable = forward ? sourceTriple[0] : targetTriple[0];
  const secondDataPatternVariable = forward ? targetTriple[0] : sourceTriple[0];
  return computeEdgeTriple({
    value: forward ? source : target,
    triple: sourceTriple,
    nodeType: relationSource,
    context,
  })
    .concat(
      computeEdgeTriple({
        value: forward ? target : source,
        triple: targetTriple,
        nodeType: relationTarget,
        context,
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
  context,
}: {
  filteredRelations: ForwardType[];
  source: string;
  target: string;
  context: TranslatorContext;
}) => {
  return filteredRelations.map((relation) => {
    const {
      triples,
      source: relationSource,
      destination: relationTarget,
      forward,
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
    const id = nanoid(9);
    return replaceDatalogVariables(
      [
        { from: source, to: source },
        { from: target, to: target },
        { from: true, to: (v) => `${id}-${v}` },
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

  const groupRelations = (
    relations: RelationType[]
  ): CombinedRelationType[] => {
    const grouped: { [key: string]: CombinedRelationType } = {};

    relations.forEach((relation) => {
      const key = `${relation.id}-${relation.isComplement}`;
      if (!grouped[key]) {
        grouped[key] = {
          text: relation.text,
          id: relation.id,
          relation: [relation.relation],
          isComplement: relation.isComplement,
        };
      } else {
        grouped[key].relation.push(relation.relation);
      }
    });

    return Object.values(grouped);
  };

  const requiredRelations = groupRelations(
    Array.from(relationTypesWithComplementTypes).filter(({ id }) =>
      relationsInQuery.some((r) => r.id === id)
    )
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
      }: {
        source: string;
        target: string;
        context: TranslatorContext;
      }) => {
        const forwardType = r.relation.map((rel) => ({
          ...rel,
          forward: !r.isComplement,
        }));

        const andParts = generateAndParts({
          filteredRelations: forwardType,
          source,
          target,
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
