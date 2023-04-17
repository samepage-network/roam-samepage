import {
  DatalogArgument,
  DatalogBinding,
  DatalogClause,
  DatalogSrcVar,
  DatalogVariable,
} from "roamjs-components/types/native";

// https://docs.datomic.com/on-prem/query/query.html#query
export type DatalogQuery = {
  type: "query";
  findSpec: DatalogFindSpec;
  returnMapSpec?: DatalogReturnMapSpec;
  withClauses?: DatalogVariable[];
  inputs?: DatalogInput[];
  whereClauses: DatalogClause[];
};

export type DatalogFindSpec =
  | DatalogFindRel
  | DatalogFindColl
  | DatalogFindTuple
  | DatalogFindScalar;

export type DatalogFindRel = {
  type: "find-rel";
  elements: DatalogFindElement[];
};

export type DatalogFindColl = {
  type: "find-coll";
  element: DatalogFindElement;
};

export type DatalogFindTuple = {
  type: "find-tuple";
  elements: DatalogFindElement[];
};

export type DatalogFindScalar = {
  type: "find-scalar";
  element: DatalogFindElement;
};

export type DatalogFindElement =
  | DatalogVariable
  | DatalogPullExpression
  | DatalogAggregate;

export type DatalogPullExpression = {
  type: "pull-expression";
  variable: DatalogVariable;
  pattern: DatalogPattern;
};

export type DatalogSymbol = {
  type: "symbol";
  value: string;
};

export type DatalogPattern = DatalogPatternName | DatalogPatternDataLiteral;

export type DatalogPatternName = {
  type: "pattern-name";
  value: string; // symbol that doesn't begin with "$" or "?"
};

export type DatalogPatternDataLiteral = {
  type: "pattern-data-literal";
  attrSpecs: DatalogAttrSpec[];
};

export type DatalogAttrSpec =
  | DatalogAttrName
  | DatalogWildcard
  | DatalogMapSpec
  | DatalogAttrExpr;

export type DatalogAttrName = {
  type: "attr-name";
  value: string; // an edn keyword that names an attr
};

export type DatalogWildcard = {
  type: "wildcard"; // "*"
};

export type DatalogMapSpec = {
  type: "map-spec";
  entries: {
    key: DatalogAttrName | DatalogAttrExpr;
    value: DatalogPattern | DatalogRecursionLimit;
  }[];
};

export type DatalogAttrExpr = {
  type: "attr-expr";
  name: DatalogAttrName;
  options: DatalogAttrExprOption[];
};

export type DatalogAttrExprOption =
  | DatalogAsExpr
  | DatalogLimitExpr
  | DatalogDefaultExpr;

export type DatalogAsExpr = {
  type: "as-expr";
  name: DatalogAttrName;
  value: string;
};

export type DatalogLimitExpr = {
  type: "limit-expr";
  name: DatalogAttrName;
  value: number | null;
};

export type DatalogDefaultExpr = {
  type: "default-expr";
  name: DatalogAttrName;
  value: string;
};

export type DatalogRecursionLimit = {
  type: "recursion-limit";
  value: number | "...";
};

export type DatalogAggregate = {
  type: "aggregate";
  name: string;
  args: DatalogArgument[];
};

export type DatalogInput =
  | DatalogBinding
  | DatalogSrcVar
  | DatalogPattern
  | DatalogRulesVar;

export type DatalogRulesVar = {
  type: "rules-var";
  value: "%";
};

export type DatalogReturnMapSpec =
  | DatalogReturnKeys
  | DatalogReturnSyms
  | DatalogReturnStrs;

export type DatalogReturnKeys = {
  type: "return-keys";
  symbols: DatalogSymbol[];
};

export type DatalogReturnSyms = {
  type: "return-syms";
  symbols: DatalogSymbol[];
};

export type DatalogReturnStrs = {
  type: "return-strs";
  symbols: DatalogSymbol[];
};
