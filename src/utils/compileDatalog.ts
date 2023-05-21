import type {
  DatalogArgument,
  DatalogBinding,
  DatalogClause,
} from "roamjs-components/types/native";
import {
  DatalogAttrSpec,
  DatalogFindElement,
  DatalogInput,
  DatalogQuery,
  DatalogRecursionLimit,
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
    | DatalogBinding
    | DatalogInput
    | DatalogRecursionLimit,
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
          ? `${d.findSpec.elements
              .map((el) => compileDatalog(el, level + 2))
              .join("\n")}`
          : d.findSpec.type === "find-coll"
          ? `${indent(level + 1)}[\n${compileDatalog(
              d.findSpec.element,
              level + 2
            )} '...'\n${indent(level + 1)}]`
          : `${compileDatalog(d.findSpec.element, level + 2)} '.'`
      }`;

      const returnMap = d.returnMapSpec
        ? `:${d.returnMapSpec.type.replace(
            "return-",
            ""
          )} ${d.returnMapSpec.symbols.map((s) => toVar(s.value)).join(" ")}`
        : "";

      const withClause = d.withClauses
        ? `:with ${d.withClauses.map((c) => compileDatalog(c)).join(" ")}`
        : "";

      const inputs = d.inputs
        ? `:in ${d.inputs.map((d) => compileDatalog(d)).join(" ")}`
        : "";

      const where = `:where\n${d.whereClauses
        .map((c) => compileDatalog(c, level + 2))
        .join(`\n`)}`;

      return `[\n${[find, returnMap, withClause, inputs, where]
        .filter(Boolean)
        .map((s) => `${indent(level + 1)}${s}`)
        .join("\n")}\n]`;
    case "pattern-data-literal":
      return `[\n${d.attrSpecs
        .map((attr) => `${indent(level + 1)}${compileDatalog(attr, level + 1)}`)
        .join("\n")}]`;
    case "pattern-name":
      return d.value;
    case "pull-expression":
      return `${indent(level)}[pull ${compileDatalog(
        d.variable
      )} ${compileDatalog(d.pattern)}\n${indent(level)}]`;
    case "aggregate":
      return `[${d.name} ${d.args.map((a) => compileDatalog(a)).join(" ")}]`;
    case "attr-name":
      return toVar(d.value);
    case "wildcard":
      return "*";
    case "map-spec":
      return `${indent(level)}${d.entries
        .map((e) => `{${compileDatalog(e.key)} ${compileDatalog(e.value)}}`)
        .join(" ")}`;
    case "recursion-limit":
      return d.value.toString();
    // case "attr-expr":
    //   return d.options
    //     .map(
    //       (opt) =>
    //         `${indent(level)}${
    //           opt.type === "as-expr"
    //             ? `[${opt.name.value} :as "${opt.value}"]`
    //             : opt.type === "limit-expr"
    //             ? `[${opt.name.value} :limit "${opt.value}"]`
    //             : `[${opt.name.value} :default "${opt.value}"]`
    //         }`
    //     )
    //     .join("\n");
    case "as-expr":
      return `${indent(level)}[${d.name.value} :as "${d.value}"]`;
    case "limit-expr":
      return `${indent(level)}[${d.name.value} :limit "${d.value}"]`;
    case "default-expr":
      return `${indent(level)}[${d.name.value} :default "${d.value}"]`;
    case "data-pattern":
      return `${indent(level)}[${
        d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""
      }${(d.arguments || []).map((a) => compileDatalog(a, level)).join(" ")}]`;
    case "src-var":
      return `$${toVar(d.value)}`;
    case "constant":
    case "underscore":
      return d.value || "_";
    case "variable":
      return `?${toVar(d.value)}`;
    case "fn-expr":
      return `${indent(level)}[(${d.fn} ${(d.arguments || [])
        .map((a) => compileDatalog(a, level))
        .join(" ")}) ${compileDatalog(d.binding, level)}]`;
    case "pred-expr":
      return `${indent(level)}[(${d.pred} ${(d.arguments || [])
        .map((a) => compileDatalog(a, level))
        .join(" ")})]`;
    case "rule-expr":
      return `${indent(level)}[${
        d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""
      }${(d.arguments || []).map((a) => compileDatalog(a, level)).join(" ")}]`;
    case "not-clause":
      return `(${d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""}not ${(
        d.clauses || []
      )
        .map((a) => compileDatalog(a, level + 1))
        .join(" ")})`;
    case "or-clause":
      return `${indent(level)}(${
        d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""
      }or ${(d.clauses || [])
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
      return `${indent(level)}(${
        d.srcVar ? `${compileDatalog(d.srcVar, level)} ` : ""
      }or-join [${(d.variables || [])
        .map((v) => compileDatalog(v, level))
        .join(" ")}]\n${(d.clauses || [])
        .map((a) => compileDatalog(a, level + 1))
        .join("\n")})`;
    case "bind-scalar":
      if (!d.variable) return "";
      return compileDatalog(d.variable, level);
    case "bind-rel":
      return `[[${d.args.map((a) => compileDatalog(a, level)).join(" ")}]]`;
    default:
      console.error(`Unknown datalog type: ${d.type}`);
      return "";
  }
};

export default compileDatalog;
