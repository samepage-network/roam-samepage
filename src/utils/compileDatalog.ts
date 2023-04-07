import type {
  DatalogArgument,
  DatalogBinding,
  DatalogClause,
} from "roamjs-components/types/native";
import {
  DatalogAttrSpec,
  DatalogFindElement,
  DatalogQuery,
} from "./datalogTypes";

const indent = (n: number) => "".padStart(n * 2, " ");

const toVar = (v = "undefined") => v.replace(/[\s"()[\]{}/\\]/g, "");

// TODO - look into an edn library instead: edn.stringify(data, null, 2)
const compileDatalog = (
  d:
    | DatalogQuery
    | DatalogFindElement
    | DatalogAttrSpec
    | DatalogClause
    | DatalogArgument
    | DatalogBinding,
  level = 0
): string => {
  switch (d.type) {
    case "query":
      const find = `:find\n${
        d.findSpec.type === "find-rel"
          ? d.findSpec.elements
              .map((el) => compileDatalog(el, level + 1))
              .join("\n")
          : d.findSpec.type === "find-tuple"
          ? `${indent(level + 1)}(\n${d.findSpec.elements
              .map((el) => compileDatalog(el, level + 2))
              .join("\n")}\n${level + 1})`
          : d.findSpec.type === "find-coll"
          ? `${indent(level + 1)}[\n${compileDatalog(
              d.findSpec.element,
              level + 2
            )} '...'\n${indent(level + 1)}]`
          : `${compileDatalog(d.findSpec.element, level + 2)} '.'`
      }`;

      const where = `:where
     ${d.whereClauses
       .map((c) => `${indent(level + 2)}${compileDatalog(c, level + 2)}`)
       .join(`\n`)}`;

      return `[${[find, where]
        .map((s) => `${indent(level + 1)}${s}`)
        .join("\n")}]`;
    case "pull-expression":
      return `[pull ${compileDatalog(d.variable)} ${
        d.pattern.type === "pattern-name"
          ? d.pattern.value
          : d.pattern.attrSpecs
              .map((attr) => compileDatalog(attr, level + 2))
              .join("\n")
      }`;
    case "attr-expr":
      return d.options
        .map((opt) =>
          opt.type === "as-expr"
            ? `[${opt.name} :as "${opt.value}"]`
            : opt.type === "limit-expr"
            ? `[${opt.name} :limit "${opt.value}"]`
            : `[${opt.name} :default "${opt.value}"]`
        )
        .join("\n");
    case "data-pattern":
      return `[${d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""}${(
        d.arguments || []
      )
        .map((a) => compileDatalog(a, level))
        .join(" ")}]`;
    case "src-var":
      return `$${toVar(d.value)}`;
    case "constant":
    case "underscore":
      return d.value || "_";
    case "variable":
      return `?${toVar(d.value)}`;
    case "fn-expr":
      if (!d.binding) return "";
      return `[(${d.fn} ${(d.arguments || [])
        .map((a) => compileDatalog(a, level))
        .join(" ")}) ${compileDatalog(d.binding, level)}]`;
    case "pred-expr":
      return `[(${d.pred} ${(d.arguments || [])
        .map((a) => compileDatalog(a, level))
        .join(" ")})]`;
    case "rule-expr":
      return `[${d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""}${(
        d.arguments || []
      )
        .map((a) => compileDatalog(a, level))
        .join(" ")}]`;
    case "not-clause":
      return `(${d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""}not ${(
        d.clauses || []
      )
        .map((a) => compileDatalog(a, level + 1))
        .join(" ")})`;
    case "or-clause":
      return `(${d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""}or ${(
        d.clauses || []
      )
        .map((a) => compileDatalog(a, level + 1))
        .join("\n")})`;
    case "and-clause":
      return `${indent(level)}(and\n${(d.clauses || [])
        .map((c) => compileDatalog(c, level + 1))
        .join("\n")}\n${indent(level)})`;
    case "not-join-clause":
      return `(${
        d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""
      }not-join [${(d.variables || [])
        .map((v) => compileDatalog(v, level))
        .join(" ")}] ${(d.clauses || [])
        .map((a) => compileDatalog(a, level + 1))
        .join(" ")})`;
    case "or-join-clause":
      return `(${
        d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""
      }or-join [${(d.variables || [])
        .map((v) => compileDatalog(v, level))
        .join(" ")}]\n${(d.clauses || [])
        .map((a) => compileDatalog(a, level + 1))
        .join("\n")})`;
    case "bind-scalar":
      if (!d.variable) return "";
      return compileDatalog(d.variable, level);
    default:
      return "";
  }
};

export default compileDatalog;
