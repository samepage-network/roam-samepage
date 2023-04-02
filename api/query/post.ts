import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";
import getAccessToken from "samepage/backend/getAccessToken";
import { z } from "zod";
import { DatalogClause, PullBlock } from "roamjs-components/types/native";
import parseNlpDate from "roamjs-components/date/parseNlpDate";
import startOfDay from "date-fns/startOfDay";
import endOfDay from "date-fns/endOfDay";
import normalizePageTitle from "roamjs-components/queries/normalizePageTitle";
import { DAILY_NOTE_PAGE_TITLE_REGEX } from "roamjs-components/date/constants";
import compileDatalog from "roamjs-components/queries/compileDatalog";

const zCondition = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
});

type Condition = z.infer<typeof zCondition>;

const bodySchema = z.object({
  conditions: zCondition.array(),
  returnNode: z.string(),
});

type Body = z.infer<typeof bodySchema>;
type Translator = {
  callback: (args: Condition) => DatalogClause[];
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
}: Omit<Body, "selections">) => {
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

const getDatalogQuery = ({ conditions, returnNode }: Body) => {
  const where = optimizeQuery(
    getWhereClauses({ conditions, returnNode }),
    new Set([])
  ) as DatalogClause[];
  const query = `[:find
  (pull ?${returnNode} [
    [:block/uid :as "uid"]
    [:node/title :as "text"]
    [:block/string :as "text"]
  ])
:where
${
  where.length === 1 && where[0].type === "not-clause"
    ? `[?${returnNode} :block/uid _]`
    : ""
}  ${where.map((c) => compileDatalog(c, 0)).join("\n  ")}\n]`;
  return query;
};

const queryRoam = ({
  token,
  graph,
  query,
}: {
  token: string;
  graph: string;
  query: string;
}) => {
  const Authorization = `Bearer ${token.replace(/^Bearer /, "")}`;
  return fetch(`https://api.roamresearch.com/api/graph/${graph}/q`, {
    body: JSON.stringify({ query }),
    headers: {
      Authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "follow",
  }).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json() as Promise<{ result: PullBlock[][] }>;
  });
};

const logic = async ({
  authorization,
  ...body
}: Body & { authorization: string }) => {
  const { accessToken, workspace } = await getAccessToken(authorization);
  const query = getDatalogQuery(body);
  return queryRoam({
    query,
    graph: workspace,
    token: accessToken,
  }).then(({ result }) => ({ results: result.map(([r]) => r), query }));
};

export default createAPIGatewayProxyHandler({
  logic,
  bodySchema,
  allowedOrigins: [/roamresearch\.com/],
});
