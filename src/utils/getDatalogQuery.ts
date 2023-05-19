import { z } from "zod";
import { DatalogClause } from "roamjs-components/types/native";
import parseNlpDate from "roamjs-components/date/parseNlpDate";
import startOfDay from "date-fns/startOfDay";
import endOfDay from "date-fns/endOfDay";
import normalizePageTitle from "roamjs-components/queries/normalizePageTitle";
import { DAILY_NOTE_PAGE_TITLE_REGEX } from "roamjs-components/date/constants";
import {
  DatalogFindElement,
  DatalogFindSpec,
  DatalogQuery,
} from "./datalogTypes";
import {
  JSONData,
  notebookRequestNodeQuerySchema,
  zOldSelection,
  zSelection,
} from "samepage/internal/types";

export type SamePageQueryArgs = Omit<
  z.infer<typeof notebookRequestNodeQuerySchema>,
  "schema"
>;
type Condition = SamePageQueryArgs["conditions"][number];
type Selection = SamePageQueryArgs["selections"][number];
type NewSelection = z.infer<typeof zSelection>;
type OldSelection = z.infer<typeof zOldSelection>;

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
  };
  if (NODE_TEST.test(s.text)) {
    const match = s.text.match(NODE_TEST);
    selection.node = (match?.[1] || returnNode)?.trim();
    selection.fields.push(
      { attr: ":block/uid", suffix: "-uid" },
      { attr: ":block/string" },
      { attr: ":node/title" }
    );
    // TODO - rest of NODE_TEST
  } else if (CREATE_DATE_TEST.test(s.text)) {
    selection.fields.push({ attr: ":create/time" });
  } else {
    selection.fields.push(
      { attr: ":entity/attrs" },
      { attr: ":entity/attrs", suffix: "-uid" }
    );
  }
  return selection as NewSelection;
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
      .map((s) => {
        return {
          type: "pull-expression",
          variable: {
            type: "variable",
            value: s.node || returnNode,
          },
          pattern: {
            type: "pattern-data-literal",
            attrSpecs: s.fields.map((f) => ({
              type: "as-expr",
              name: { type: "attr-name", value: f.attr },
              value: `${s.label}${f.suffix || ""}`,
            })),
          },
        };
      }),
  };
};

type Translator = {
  callback: (args: { source: string; target: string }) => DatalogClause[];
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
};

const conditionToDatalog = (con: Condition): DatalogClause[] => {
  const { relation, ...condition } = con;
  const datalogTranslator = translator[relation.toLowerCase()];
  const datalog = datalogTranslator?.callback?.(condition) || [];
  return datalog;
};

const getWhereClauses = ({
  conditions,
  returnNode,
}: Omit<SamePageQueryArgs, "selections">) => {
  return conditions.length
    ? conditions.flatMap(conditionToDatalog)
    : conditionToDatalog({
        relation: "self",
        source: returnNode,
        target: returnNode,
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

const getDatalogQuery = ({
  conditions,
  returnNode,
  selections: _sels,
}: SamePageQueryArgs): DatalogQuery & {
  transformResults: (results: JSONData[][]) => JSONData[];
} => {
  const selections = _sels.map((s) => upgradeSelection(s, returnNode));
  const findSpec = getFindSpec({ selections, returnNode });
  const where = optimizeQuery(
    getWhereClauses({ conditions, returnNode }),
    new Set([])
  ) as DatalogClause[];
  const initialWhereClauses: DatalogClause[] =
    where.length === 1 && where[0].type === "not-clause"
      ? [
          {
            type: "data-pattern" as const,
            arguments: [
              { type: "variable", value: returnNode },
              { type: "constant", value: "block/uid" },
              { type: "underscore", value: "_" },
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
        // TODO - perform transformations
        return selections.reduce((prev, _curr) => {
          return prev;
        }, output);
      });
    },
  };
};

export default getDatalogQuery;
