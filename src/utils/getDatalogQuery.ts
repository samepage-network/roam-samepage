import { z } from "zod";
import { DatalogClause, DatalogVariable } from "roamjs-components/types/native";
import parseNlpDate from "roamjs-components/date/parseNlpDate";
import startOfDay from "date-fns/startOfDay";
import endOfDay from "date-fns/endOfDay";
import normalizePageTitle from "roamjs-components/queries/normalizePageTitle";
import { DAILY_NOTE_PAGE_TITLE_REGEX } from "roamjs-components/date/constants";
import {
  DatalogAttrSpec,
  DatalogFindElement,
  DatalogFindSpec,
  DatalogPullExpression,
  DatalogPullPatternDataLiteral,
  DatalogQuery,
} from "./datalogTypes";
import {
  JSONData,
  notebookRequestNodeQuerySchema,
  zSelection,
  zSelectionField,
  zSelectionTransform,
  zCondition,
} from "samepage/internal/types";
import datefnsFormat from "date-fns/format";
import compileDatalog from "./compileDatalog";

export type SamePageQueryArgs = Omit<
  z.infer<typeof notebookRequestNodeQuerySchema>,
  "schema"
>;

type Condition = SamePageQueryArgs["conditions"][number];
type Selection = SamePageQueryArgs["selections"][number];
type NewSelection = z.infer<typeof zSelection>;
type NewCondition = z.infer<typeof zCondition>;

const WILDCARD_NODE_TYPES = ["*", "Any Discourse Node"]; // Backwards compatibility with Query Builder

// TODO
const ALIAS_TEST = /^node$/i;
const REGEX_TEST = /\/([^}]*)\//;
const CREATE_DATE_TEST = /^\s*created?\s*(date|time|since)\s*$/i;
const EDIT_DATE_TEST = /^\s*edit(?:ed)?\s*(date|time|since)\s*$/i;
const CREATE_BY_TEST = /^\s*(author|create(d)?\s*by)\s*$/i;
const EDIT_BY_TEST = /^\s*(last\s*)?edit(ed)?\s*by\s*$/i;
const SUBTRACT_TEST = /^subtract\(([^,)]+),([^,)]+)\)$/i;
const ADD_TEST = /^add\(([^,)]+),([^,)]+)\)$/i;
const NODE_TEST = /^node:(\s*[^:]+\s*)(:.*)?$/i;
const ACTION_TEST = /^action:\s*([^:]+)\s*(?::(.*))?$/i;
const MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24;
const upgradeSelection = (s: Selection, returnNode: string): NewSelection => {
  if (!("text" in s)) return s;
  const selection: Partial<NewSelection> = {
    label: s.label,
    fields: [],
    transforms: [],
  };
  if (NODE_TEST.test(s.text)) {
    const match = s.text.match(NODE_TEST);
    selection.node = (match?.[1] || returnNode)?.trim();
    selection.fields.push(
      { attr: ":block/uid", suffix: "-uid" },
      { attr: ":block/string", suffix: "-string" },
      { attr: ":node/title", suffix: "-title" }
    );
    selection.transforms.push({
      method: "or",
      set: s.label,
      or: [`${s.label}-string`, `${s.label}-title`],
    });
  } else if (CREATE_DATE_TEST.test(s.text)) {
    selection.fields.push({ attr: ":create/time" });
    selection.transforms.push({
      method: "date",
      date: s.label,
      set: `${s.label}-display`,
      format: "MMMM do, yyyy",
    });
  } else if (EDIT_DATE_TEST.test(s.text)) {
    selection.fields.push({ attr: ":edit/time", suffix: "-value" });
    selection.transforms.push({
      method: "date",
      set: s.label,
      date: `${s.label}-value`,
    });
  } else {
    selection.fields.push(
      { attr: ":entity/attrs", suffix: "-attrs" },
      {
        attr: ":attrs/lookup",
        suffix: "-lookup",
        fields: [
          { attr: ":block/uid", suffix: "-block" },
          { attr: ":node/title", suffix: "-title" },
        ],
      }
    );
    selection.transforms.push(
      {
        method: "set",
        set: `${s.label}-name`,
        value: s.text,
      },
      {
        method: "find",
        find: `${s.label}-lookup`,
        set: `${s.label}-find`,
        key: `${s.label}-title`,
        value: `${s.label}-name`,
      },
      {
        method: "access",
        access: `${s.label}-find.${s.label}-block`,
        set: `${s.label}-access`,
        key: `${s.label}-block`,
      },
      {
        method: "find",
        find: `${s.label}-attrs`,
        set: `${s.label}-attr`,
        key: "1.:value.1",
        value: `${s.label}-access`,
      },
      {
        method: "access",
        access: `${s.label}-attr.2.:value`,
        set: s.label,
        key: "2.:value",
      },
      {
        method: "trim",
        trim: s.label,
        set: s.label,
      }
    );
  }
  return selection as NewSelection;
};
const upgradeCondition = (c: Condition): NewCondition => {
  if (c.type === "clause") {
    return {
      type: "AND",
      source: c.source,
      relation: c.relation,
      target: c.target,
    };
  } else if (c.type === "not") {
    return {
      type: "NOT",
      conditions: [
        {
          type: "AND",
          source: c.source,
          relation: c.relation,
          target: c.target,
        },
      ],
    };
  } else if (c.type === "or") {
    return {
      type: "OR",
      conditions: c.conditions.map(upgradeCondition).map((c) => [c]),
    };
  } else if (c.type === "not or") {
    return {
      type: "NOT",
      conditions: [
        {
          type: "OR",
          conditions: c.conditions.map(upgradeCondition).map((c) => [c]),
        },
      ],
    };
  }
  return c;
};

const getPullPatternDataLiteral = ({
  fields,
  label,
}: {
  fields: z.infer<typeof zSelectionField>[];
  label: string;
}): DatalogPullPatternDataLiteral => {
  return {
    type: "pattern-data-literal",
    attrSpecs: fields.map((f): DatalogAttrSpec => {
      const attrName = label
        ? {
            type: "as-expr" as const,
            name: { type: "attr-name" as const, value: f.attr },
            value: `${label}${f.suffix || ""}`,
          }
        : { type: "attr-name" as const, value: f.attr };
      if (f.fields) {
        return {
          type: "map-spec",
          entries: [
            {
              key: attrName,
              value: getPullPatternDataLiteral({ fields: f.fields, label }),
            },
          ],
        };
      }
      return attrName;
    }),
  };
};

const getFindSpec = ({
  returnNode,
  selections,
}: {
  returnNode: string;
  selections: NewSelection[];
}): DatalogFindSpec => {
  return {
    type: "find-tuple",
    elements: selections
      .concat([
        {
          label: "text",
          fields: [{ attr: ":block/string" }],
          node: returnNode,
        },
        { label: "text", fields: [{ attr: ":node/title" }], node: returnNode },
        { label: "uid", fields: [{ attr: ":block/uid" }], node: returnNode },
      ])
      .map((s): DatalogPullExpression => {
        return {
          type: "pull-expression",
          variable: {
            type: "variable",
            value: s.node || returnNode,
          },
          pattern: getPullPatternDataLiteral({
            fields: s.fields,
            label: s.label,
          }),
        };
      }),
  };
};

type NodeType = {
  text: string;
  id: string;
  backedBy: "default" | "user" | "relation";
  specification: NewCondition[];
};
type RelationType = {
  text: string;
  id: string;
  specification: NewCondition[];
};

type TranslatorContext = {
  nodeTypes: NodeType[];
  relationTypes: RelationType[];
};

type Translator = {
  callback: (args: {
    source: string;
    target: string;
    context: TranslatorContext;
  }) => DatalogClause[];
  targetOptions?: string[] | ((source: string) => string[]);
  placeholder?: string;
  isVariable?: true;
};

const getTitleDatalog = ({
  source,
  target,
}: {
  source: string;
  target: string;
}): DatalogClause[] => {
  const dateMatch = /^\s*{date(?::([^}]+))?}\s*$/i.exec(target);
  if (dateMatch) {
    const nlp = dateMatch[1] || "";
    if (nlp) {
      const date = parseNlpDate(nlp);
      return [
        {
          type: "data-pattern",
          arguments: [
            { type: "variable", value: source },
            { type: "constant", value: ":node/title" },
            {
              type: "constant",
              value: `"${window.roamAlphaAPI.util.dateToPageTitle(date)}"`,
            },
          ],
        },
      ];
    } else {
      return [
        {
          type: "data-pattern",
          arguments: [
            { type: "variable", value: source },
            { type: "constant", value: ":node/title" },
            { type: "variable", value: `${source}-Title` },
          ],
        },
        {
          type: "fn-expr",
          fn: "re-pattern",
          arguments: [
            {
              type: "constant",
              value: `"${DAILY_NOTE_PAGE_TITLE_REGEX.source}"`,
            },
          ],
          binding: {
            type: "bind-scalar",
            variable: { type: "variable", value: `date-regex` },
          },
        },
        {
          type: "pred-expr",
          pred: "re-find",
          arguments: [
            { type: "variable", value: "date-regex" },
            { type: "variable", value: `${source}-Title` },
          ],
        },
      ];
    }
  }
  if (target.startsWith("/") && target.endsWith("/")) {
    return [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":node/title" },
          { type: "variable", value: `${source}-Title` },
        ],
      },
      {
        type: "fn-expr",
        fn: "re-pattern" as const,
        arguments: [
          {
            type: "constant",
            value: `"${target.slice(1, -1).replace(/\\/g, "\\\\")}"`,
          },
        ],
        binding: {
          type: "bind-scalar",
          variable: { type: "variable", value: `${target}-regex` },
        },
      },
      {
        type: "pred-expr",
        pred: "re-find",
        arguments: [
          { type: "variable", value: `${target}-regex` },
          { type: "variable", value: `${source}-Title` },
        ],
      },
    ];
  }
  return [
    {
      type: "data-pattern",
      arguments: [
        { type: "variable", value: source },
        { type: "constant", value: ":node/title" },
        { type: "constant", value: `"${normalizePageTitle(target)}"` },
      ],
    },
  ];
};

const conditionToDatalog = ({
  condition: con,
  context,
}: {
  condition: NewCondition;
  context: TranslatorContext;
}): DatalogClause[] => {
  if (con.type === "AND") {
    const { relation, ...condition } = con;
    const datalogTranslator = translator[relation.toLowerCase()];
    const datalog =
      datalogTranslator?.callback?.({
        source: condition.source,
        target: condition.target,
        context,
      }) || [];
    return datalog;
  }
  const type = `${con.type.toLowerCase() as "or" | "not"}-clause` as const;
  return [
    {
      type,
      clauses: con.conditions.flatMap((c) =>
        Array.isArray(c)
          ? c.flatMap((condition) => conditionToDatalog({ condition, context }))
          : conditionToDatalog({ condition: c, context })
      ),
    },
  ];
};

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

const getNodeTypeDatalog = ({
  freeVar,
  nodeType,
  context,
}: {
  nodeType: NodeType;
  freeVar: string;
  context: TranslatorContext;
}): DatalogClause[] => {
  const clauses = nodeType.specification.flatMap((condition) =>
    conditionToDatalog({ condition, context })
  );
  return replaceDatalogVariables(
    [{ from: nodeType.text, to: freeVar }],
    clauses
  );
};

const translator: Record<string, Translator> = {
  self: {
    callback: ({ source }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/uid" },
          { type: "constant", value: `"${source}"` },
        ],
      },
    ],
  },
  references: {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/refs" },
          { type: "variable", value: target },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "is referenced by": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: target },
          { type: "constant", value: ":block/refs" },
          { type: "variable", value: source },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "is in page": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/page" },
          { type: "variable", value: target },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "has title": {
    callback: getTitleDatalog,
    targetOptions: () =>
      [
        // getAllPageNames()
      ].concat(["{date}", "{date:today}"]),
    placeholder: "Enter a page name or {date} for any DNP",
  },
  "with text in title": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":node/title" },
          { type: "variable", value: `${source}-Title` },
        ],
      },
      {
        type: "pred-expr",
        pred: "clojure.string/includes?",
        arguments: [
          { type: "variable", value: `${source}-Title` },
          { type: "constant", value: `"${normalizePageTitle(target)}"` },
        ],
      },
    ],
    placeholder: "Enter any text",
  },
  "has attribute": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: `${target}-Attribute` },
          { type: "constant", value: ":node/title" },
          { type: "constant", value: `"${target}"` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: target },
          { type: "constant", value: ":block/refs" },
          { type: "variable", value: `${target}-Attribute` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: target },
          { type: "constant", value: ":block/parents" },
          { type: "variable", value: source },
        ],
      },
    ],
    targetOptions: [], //getAllPageNames,
    placeholder: "Enter any attribute name",
    isVariable: true,
  },
  "has child": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/children" },
          { type: "variable", value: target },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "has parent": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: target },
          { type: "constant", value: ":block/children" },
          { type: "variable", value: source },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "has ancestor": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/parents" },
          { type: "variable", value: target },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "has descendant": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: target },
          { type: "constant", value: ":block/parents" },
          { type: "variable", value: source },
        ],
      },
    ],
    placeholder: "Enter any placeholder for the node",
    isVariable: true,
  },
  "with text": {
    callback: ({ source, target }) => [
      {
        type: "or-clause",
        clauses: [
          {
            type: "data-pattern",
            arguments: [
              { type: "variable", value: source },
              { type: "constant", value: ":block/string" },
              { type: "variable", value: `${source}-String` },
            ],
          },
          {
            type: "data-pattern",
            arguments: [
              { type: "variable", value: source },
              { type: "constant", value: ":node/title" },
              { type: "variable", value: `${source}-String` },
            ],
          },
        ],
      },
      {
        type: "pred-expr",
        pred: "clojure.string/includes?",
        arguments: [
          { type: "variable", value: `${source}-String` },
          { type: "constant", value: `"${normalizePageTitle(target)}"` },
        ],
      },
    ],
    placeholder: "Enter any text",
  },
  "created by": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":create/user" },
          { type: "variable", value: `${source}-User` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: `${source}-User` },
          { type: "constant", value: ":user/display-page" },
          { type: "variable", value: `${source}-User-Display` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: `${source}-User-Display` },
          { type: "constant", value: ":node/title" },
          { type: "constant", value: `"${normalizePageTitle(target)}"` },
        ],
      },
    ],
    targetOptions: () => [],
    // window.roamAlphaAPI.data.fast
    //   .q(`[:find (pull ?n [:node/title]) :where [?u :user/display-page ?n]]`)
    //   .map((d: [PullBlock]) => d[0][":node/title"]),
    placeholder: "Enter the display name of any user with access to this graph",
  },
  "edited by": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":edit/user" },
          { type: "variable", value: `${source}-User` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: `${source}-User` },
          { type: "constant", value: ":user/display-page" },
          { type: "variable", value: `${source}-User-Display` },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: `${source}-User-Display` },
          { type: "constant", value: ":node/title" },
          { type: "constant", value: `"${normalizePageTitle(target)}"` },
        ],
      },
    ],
    targetOptions: () => [],
    // window.roamAlphaAPI.data.fast
    //   .q(`[:find (pull ?n [:node/title]) :where [?u :user/display-page ?n]]`)
    //   .map((d: [PullBlock]) => d[0][":node/title"]),
    placeholder: "Enter the display name of any user with access to this graph",
  },
  "references title": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/refs" },
          { type: "variable", value: `${target}-Ref` },
        ],
      },
      ...getTitleDatalog({ source: `${target}-Ref`, target }),
    ],
    targetOptions: () =>
      [
        // getAllPageNames()
      ].concat(["{date}", "{date:today}"]),
    placeholder: "Enter a page name or {date} for any DNP",
  },
  "has heading": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/heading" },
          { type: "constant", value: target },
        ],
      },
    ],
    targetOptions: ["1", "2", "3", "0"],
    placeholder: "Enter a heading value (0, 1, 2, 3)",
  },
  "is in page with title": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":block/page" },
          { type: "variable", value: target },
        ],
      },
      ...getTitleDatalog({ source: target, target }),
    ],
    targetOptions: () =>
      [
        //  getAllPageNames()
      ].concat(["{date}", "{date:today}"]),
    placeholder: "Enter a page name or {date} for any DNP",
  },
  "created after": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":create/time" },
          { type: "variable", value: `${source}-CreateTime` },
        ],
      },
      {
        type: "pred-expr",
        pred: "<",
        arguments: [
          { type: "constant", value: `${parseNlpDate(target).valueOf()}` },
          { type: "variable", value: `${source}-CreateTime` },
        ],
      },
    ],
    placeholder: "Enter any natural language date value",
  },
  "created before": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":create/time" },
          { type: "variable", value: `${source}-CreateTime` },
        ],
      },
      {
        type: "pred-expr",
        pred: ">",
        arguments: [
          { type: "constant", value: `${parseNlpDate(target).valueOf()}` },
          { type: "variable", value: `${source}-CreateTime` },
        ],
      },
    ],
    placeholder: "Enter any natural language date value",
  },
  "edited after": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":edit/time" },
          { type: "variable", value: `${source}-EditTime` },
        ],
      },
      {
        type: "pred-expr",
        pred: "<",
        arguments: [
          { type: "constant", value: `${parseNlpDate(target).valueOf()}` },
          { type: "variable", value: `${source}-EditTime` },
        ],
      },
    ],
    placeholder: "Enter any natural language date value",
  },
  "edited before": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":edit/time" },
          { type: "variable", value: `${source}-EditTime` },
        ],
      },
      {
        type: "pred-expr",
        pred: ">",
        arguments: [
          { type: "constant", value: `${parseNlpDate(target).valueOf()}` },
          { type: "variable", value: `${source}-EditTime` },
        ],
      },
    ],
    placeholder: "Enter any natural language date value",
  },
  "titled before": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":log/id" },
          { type: "variable", value: `${source}-Log` },
        ],
      },
      {
        type: "pred-expr",
        pred: ">",
        arguments: [
          {
            type: "constant",
            value: `${startOfDay(parseNlpDate(target)).valueOf()}`,
          },
          { type: "variable", value: `${source}-Log` },
        ],
      },
    ],
    placeholder: "Enter any natural language date value",
  },
  "titled after": {
    callback: ({ source, target }) => [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: source },
          { type: "constant", value: ":log/id" },
          { type: "variable", value: `${source}-Log` },
        ],
      },
      {
        type: "pred-expr",
        pred: "<",
        arguments: [
          {
            type: "constant",
            value: `${endOfDay(parseNlpDate(target)).valueOf()}`,
          },
          { type: "variable", value: `${source}-Log` },
        ],
      },
    ],
    placeholder: "Enter any natural language date value",
  },
  "is a": {
    callback: ({ source, target, context }) => {
      const { nodeTypes } = context;
      const nodeTypeByIdOrText = Object.fromEntries([
        ...nodeTypes.map((n) => [n.id, n] as const),
        ...nodeTypes.map((n) => [n.text, n] as const),
      ]);
      return WILDCARD_NODE_TYPES.includes(target)
        ? [
            {
              type: "data-pattern" as const,
              arguments: [
                { type: "variable" as const, value: source },
                { type: "constant" as const, value: ":block/uid" },
                { type: "variable" as const, value: `${source}-uid` },
              ],
            },
            {
              type: "data-pattern" as const,
              arguments: [
                { type: "variable" as const, value: `${source}-any` },
                { type: "constant" as const, value: ":block/uid" },
                { type: "variable" as const, value: `${source}-uid` },
              ],
            },
            {
              type: "or-join-clause" as const,
              variables: [
                { type: "variable" as const, value: `${source}-any` },
              ],
              clauses: nodeTypes
                .filter((dn) => dn.backedBy !== "default")
                .map((dn) => ({
                  type: "and-clause" as const,
                  clauses: getNodeTypeDatalog({
                    freeVar: `${source}-any`,
                    nodeType: dn,
                    context,
                  }),
                })),
            },
          ]
        : nodeTypeByIdOrText[target]
        ? getNodeTypeDatalog({
            freeVar: `${source}-any`,
            nodeType: nodeTypeByIdOrText[target],
            context,
          })
        : [];
    },
    placeholder: "Enter a node type",
  },
};

type RoamBasicResult = {
  text: string;
  id: string;
  order: number;
  children: RoamBasicResult[];
};
const getRoamBasicResultFindSpec = ({
  textAttr,
}: {
  textAttr: string;
}): DatalogFindSpec => ({
  type: "find-tuple",
  elements: [
    {
      type: "pull-expression",
      variable: {
        type: "variable",
        value: "node",
      },
      pattern: {
        type: "pattern-data-literal",
        attrSpecs: [
          {
            type: "as-expr",
            name: {
              type: "attr-name",
              value: ":block/uid",
            },
            value: "id",
          },
          {
            type: "as-expr",
            name: {
              type: "attr-name",
              value: textAttr,
            },
            value: "text",
          },
          {
            type: "as-expr",
            name: {
              type: "attr-name",
              value: ":block/order",
            },
            value: "order",
          },
          {
            type: "map-spec",
            entries: [
              {
                key: {
                  type: "as-expr",
                  name: {
                    type: "attr-name",
                    value: ":block/children",
                  },
                  value: "children",
                },
                value: {
                  type: "recursion-limit",
                  value: "...",
                },
              },
            ],
          },
        ],
      },
    },
  ],
});
const roamNodeToCondition = ({
  children,
  text,
}: RoamBasicResult): NewCondition | null => {
  if (
    text !== "clause" &&
    text !== "not" &&
    text !== "and" &&
    text !== "or" &&
    text !== "not or"
  ) {
    return null;
  }
  return text === "clause" || text === "and"
    ? {
        source: children.find((c) => /source/i.test(c.text))?.children[0]?.text,
        target: children.find((c) => /target/i.test(c.text))?.children[0]?.text,
        relation: children.find((c) => /relation/i.test(c.text))?.children[0]
          ?.text,
        type: "AND" as const,
      }
    : text === "not" || text === "not or"
    ? {
        type: "NOT" as const,
        conditions: children.map(roamNodeToCondition).filter(Boolean),
      }
    : {
        type: "OR" as const,
        conditions: children
          .map((node) => node.children.map(roamNodeToCondition).filter(Boolean))
          .filter((cs) => cs.length),
      };
};

const findChildren = (
  children: RoamBasicResult[],
  regex: RegExp
): RoamBasicResult[] => {
  return children.find((c) => regex.test(c.text))?.children || [];
};
const getRelationTypes = async (): Promise<RelationType[]> => {
  const query = compileDatalog({
    type: "query",
    findSpec: getRoamBasicResultFindSpec({ textAttr: ":block/string" }),
    whereClauses: [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: "config" },
          { type: "constant", value: ":node/title" },
          { type: "constant", value: '"roam/js/discourse-graph"' },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: "config" },
          { type: "constant", value: ":block/children" },
          { type: "variable", value: "grammar" },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: "grammar" },
          { type: "constant", value: ":block/string" },
          { type: "constant", value: '"grammar"' },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: "grammar" },
          { type: "constant", value: ":block/children" },
          { type: "variable", value: "node" },
        ],
      },
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: "node" },
          { type: "constant", value: ":block/string" },
          { type: "constant", value: '"relations"' },
        ],
      },
    ],
  });
  const results = await window.roamAlphaAPI.data.fast.q(query);
  const relationsNode = results[0][0] as RoamBasicResult;

  const relationTypes = relationsNode.children.map(
    ({ id, text, children }: RoamBasicResult) => {
      const relation = children as RoamBasicResult[];
      const specificationTree = findChildren(relation, /^\s*if\s*$/i).sort(
        (a, b) => a.order - b.order
      );
      const specificationsArray = specificationTree
        .map((c) =>
          c.children.map((rn) => roamNodeToCondition(rn)).filter(Boolean)
        )
        .filter((cs) => cs.length);
      return {
        id,
        backedBy: "user",
        specification:
          specificationsArray.length > 1
            ? [{ type: "OR", conditions: specificationsArray }]
            : specificationsArray[0],
        text: text.replace(/^discourse-graph\/nodes/, ""),
      };
    }
  );

  return relationTypes;
};

const DEFAULT_NODES: Omit<NodeType, "backedBy">[] = [
  {
    text: "Page",
    id: "page-node",
    specification: [
      {
        type: "AND",
        source: "Page",
        relation: "has title",
        target: "/^(.*)$/",
      },
    ],
  },
  {
    text: "Block",
    id: "blck-node",
    specification: [
      {
        type: "AND",
        source: "Block",
        relation: "is in page",
        target: "_",
      },
    ],
  },
];
const getLegacySpecConditions = (
  children: RoamBasicResult[]
): RoamBasicResult[] => {
  const scratchChildren = findChildren(children, /^\s*scratch\s*$/i);
  const conditionChildren = findChildren(scratchChildren, /^\s*conditions\s*$/);
  return conditionChildren;
};
const getDirectSpecConditions = (
  children: RoamBasicResult[]
): RoamBasicResult[] => {
  const specificationChildren = findChildren(
    children,
    /^\s*specification\s*$/i
  );
  const specScratchChildren = findChildren(
    specificationChildren,
    /^\s*scratch\s*$/i
  );
  const conditionChildren = findChildren(
    specScratchChildren,
    /^\s*conditions\s*$/i
  );
  return conditionChildren;
};
const getNodeTypes = async (relations: RelationType[]): Promise<NodeType[]> => {
  const findSpec = getRoamBasicResultFindSpec({ textAttr: ":block/string" });
  const query = compileDatalog({
    type: "query",
    findSpec,
    whereClauses: [
      {
        type: "data-pattern",
        arguments: [
          { type: "variable", value: "node" },
          {
            type: "constant",
            value: ":node/title",
          },
          { type: "variable", value: "title" },
        ],
      },
      {
        type: "pred-expr",
        pred: "clojure.string/starts-with?",
        arguments: [
          { type: "variable", value: "title" },
          { type: "constant", value: '"discourse-graph/nodes/"' },
        ],
      },
    ],
  });
  const r = await window.roamAlphaAPI.data.fast.q(query);
  const results = r as [RoamBasicResult][];

  const resultsNodeTypes = results.map(([{ id, text, children }]): NodeType => {
    // Spec = Specification
    const legacySpecConditions = getLegacySpecConditions(children);
    const directSpecConditions = getDirectSpecConditions(children);
    const specConditionTree = (
      legacySpecConditions.length ? legacySpecConditions : directSpecConditions
    ).sort((a, b) => a.order - b.order);
    const specification = specConditionTree
      .map(roamNodeToCondition)
      .filter(Boolean);
    return {
      id,
      backedBy: "user" as const,
      specification,
      text,
    };
  });

  const relationNodeTypes = relations.map((rel) => ({
    id: rel.id,
    backedBy: "relation" as const,
    specification: rel.specification,
    text: rel.text,
  }));

  const defaultNodeTypes = DEFAULT_NODES.map((dn) => ({
    ...dn,
    backedBy: "default" as const,
  }));

  const nodeTypes = resultsNodeTypes
    .concat(relationNodeTypes)
    .concat(defaultNodeTypes);

  return nodeTypes;
};

const getWhereClauses = async ({
  conditions,
  returnNode,
}: {
  conditions: NewCondition[];
  returnNode: string;
}) => {
  const relationTypes = await getRelationTypes();
  const nodeTypes = await getNodeTypes(relationTypes);
  const context = {
    nodeTypes,
    relationTypes,
  };

  return conditions.length
    ? conditions.flatMap((condition) =>
        conditionToDatalog({ condition, context })
      )
    : conditionToDatalog({
        condition: {
          type: "AND",
          relation: "self",
          source: returnNode,
          target: returnNode,
        },
        context,
      });
};

const getVariables = (clause: DatalogClause): Set<string> => {
  if (
    clause.type === "data-pattern" ||
    clause.type === "fn-expr" ||
    clause.type === "pred-expr" ||
    clause.type === "rule-expr"
  ) {
    return new Set(
      [...clause.arguments]
        .filter((v) => v.type === "variable")
        .map((v) => v.value)
    );
  } else if (
    clause.type === "not-clause" ||
    clause.type === "or-clause" ||
    clause.type === "and-clause"
  ) {
    return new Set(clause.clauses.flatMap((c) => Array.from(getVariables(c))));
  } else if (
    clause.type === "not-join-clause" ||
    clause.type === "or-join-clause"
  ) {
    return new Set(clause.variables.map((c) => c.value));
  }
};

const optimizeQuery = (
  clauses: DatalogClause[],
  capturedVariables: Set<string>
): DatalogClause[] => {
  const marked = clauses.map(() => false);
  const orderedClauses: DatalogClause[] = [];
  const variablesByIndex: Record<number, Set<string>> = {};
  for (let i = 0; i < clauses.length; i++) {
    let bestClauseIndex = clauses.length;
    let bestClauseScore = Number.MAX_VALUE;
    clauses.forEach((c, j) => {
      if (marked[j]) return;
      let score = bestClauseScore;
      if (c.type === "data-pattern") {
        if (
          c.arguments[0]?.type === "variable" &&
          c.arguments[1]?.type === "constant"
        ) {
          if (c.arguments[2]?.type === "constant") {
            score = 1;
          } else if (
            c.arguments[2]?.type === "variable" &&
            (capturedVariables.has(c.arguments[0].value) ||
              capturedVariables.has(c.arguments[2].value))
          ) {
            score = 2;
          } else {
            score = 100000;
          }
        } else {
          score = 100001;
        }
      } else if (
        c.type === "not-clause" ||
        c.type === "or-clause" ||
        c.type === "and-clause"
      ) {
        const allVars =
          variablesByIndex[j] || (variablesByIndex[j] = getVariables(c));
        if (Array.from(allVars).every((v) => capturedVariables.has(v))) {
          score = 10;
        } else {
          score = 100002;
        }
      } else if (c.type === "not-join-clause" || c.type === "or-join-clause") {
        if (c.variables.every((v) => capturedVariables.has(v.value))) {
          score = 100;
        } else {
          score = 100003;
        }
      } else if (
        c.type === "fn-expr" ||
        c.type === "pred-expr" ||
        c.type === "rule-expr"
      ) {
        if (
          [...c.arguments].every(
            (a) => a.type !== "variable" || capturedVariables.has(a.value)
          )
        ) {
          score = 1000;
        } else {
          score = 100004;
        }
      } else {
        score = 100005;
      }
      if (score < bestClauseScore) {
        bestClauseScore = score;
        bestClauseIndex = j;
      }
    });
    marked[bestClauseIndex] = true;
    const bestClause = clauses[bestClauseIndex];
    orderedClauses.push(clauses[bestClauseIndex]);
    if (
      bestClause.type === "not-join-clause" ||
      bestClause.type === "or-join-clause" ||
      bestClause.type === "not-clause" ||
      bestClause.type === "or-clause" ||
      bestClause.type === "and-clause"
    ) {
      bestClause.clauses = optimizeQuery(
        bestClause.clauses,
        new Set(capturedVariables)
      );
    } else if (bestClause.type === "data-pattern") {
      bestClause.arguments
        .filter((v) => v.type === "variable")
        .forEach((v) => capturedVariables.add(v.value));
    }
  }
  return orderedClauses;
};

const get = (obj: JSONData[string], path: string): JSONData[string] => {
  const parts = path.split(".");
  return parts.reduce(
    (o, p) =>
      Array.isArray(o) ? o[Number(p)] : typeof o === "object" ? o?.[p] : o,
    obj
  );
};

const transform = (
  output: JSONData,
  transform: z.infer<typeof zSelectionTransform>
) => {
  switch (transform.method) {
    case "find": {
      const { key, value, find, set } = transform;
      const getVal = get(output, find);
      if (!Array.isArray(getVal)) return output;
      const valueVal = get(output, value);
      output[set] = getVal.find(
        (v) => typeof v === "object" && get(v, key) === valueVal
      );
      return output;
    }
    case "access": {
      const { access, set } = transform;
      output[set] = get(output, access);
      return output;
    }
    case "set": {
      const { value, set } = transform;
      output[set] = value;
      return output;
    }
    case "date": {
      const { date, set, format } = transform;
      const getVal = get(output, date);
      if (typeof getVal !== "string" && typeof getVal !== "number")
        return output;
      const dateObj = new Date(getVal);
      output[set] = format ? datefnsFormat(dateObj, format) : dateObj.toJSON();
      return output;
    }
    case "or": {
      const { or, set } = transform;
      const findKey = or.find((key) => !!get(output, key));
      if (!findKey) return output;
      output[set] = output[findKey];
      return output;
    }
    case "trim": {
      const { trim, set } = transform;
      const getVal = get(output, trim);
      if (typeof getVal !== "string") output[set] = getVal;
      else output[set] = getVal.trim();
      return output;
    }
  }
};

const getDatalogQuery = async ({
  conditions: _cons,
  returnNode,
  selections: _sels,
}: SamePageQueryArgs): Promise<
  DatalogQuery & {
    transformResults: (results: JSONData[][]) => JSONData[];
  }
> => {
  const conditions = _cons.map(upgradeCondition);
  const selections = _sels.map((s) => upgradeSelection(s, returnNode));
  const findSpec = getFindSpec({ selections, returnNode });
  const where = optimizeQuery(
    await getWhereClauses({ conditions, returnNode }),
    new Set([])
  ) as DatalogClause[];
  const initialWhereClauses: DatalogClause[] =
    where.length === 1 && where[0].type === "not-clause"
      ? [
          {
            type: "data-pattern" as const,
            arguments: [
              { type: "variable", value: returnNode },
              { type: "constant", value: ":block/uid" },
              { type: "underscore", value: "_" },
            ],
          },
        ]
      : where.length === 0
      ? [
          {
            type: "data-pattern" as const,
            arguments: [
              { type: "variable", value: returnNode },
              { type: "constant", value: ":block/uid" },
              { type: "constant", value: ":null" },
            ],
          },
        ]
      : [];
  const whereClauses = initialWhereClauses.concat(where);
  return {
    type: "query",
    findSpec,
    whereClauses,
    transformResults: (results: JSONData[][]) => {
      return results.map((a) => {
        const output = Object.fromEntries(
          a.filter((e) => e !== null).flatMap((e) => Object.entries(e))
        );
        return selections
          .flatMap((s) => s.transforms || [])
          .reduce(transform, output);
      });
    },
  };
};

export default getDatalogQuery;
