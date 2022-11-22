import type { Annotation, InitialSchema } from "samepage/internal/types";
import { getSetting } from "samepage/internal/registry";
import {
  compileLexer,
  DEFAULT_TOKENS,
  Processor,
  reduceTokens,
} from "samepage/utils/atJsonTokens";
import atJsonToRoam from "./atJsonToRoam";

const REGEXES = {
  url: DEFAULT_TOKENS.url,
  blockReference: /\(\([^)]*\)\)/,
  hashtag: /#[a-zA-Z0-9_.-]+/,
  hash: /#/,
  text: { match: /[^^~_*#[\]()!]+/, lineBreaks: true },
};

export const disambiguateTokens: Processor<InitialSchema> = (
  data,
  _,
  reject
) => {
  const [tokens] = data as [InitialSchema[]];
  const exclamationMarkIndices = tokens
    .map((token, index) => ({ token, index }))
    .filter(
      ({ token }) => token.content === "!" && token.annotations.length === 0
    );
  if (
    exclamationMarkIndices.some(({ index }) => {
      const next = tokens[index + 1];
      if (!next) return false;
      const { annotations, content } = next;
      if (annotations.length === 0) {
        // TODO regex match or investigate ordered rules in nearley
        return (
          (content.startsWith("[](") && content.endsWith(")")) ||
          (content === "[" &&
            tokens[index + 2]?.content === "]" &&
            tokens[index + 3]?.content === "(" &&
            tokens[index + 5]?.content === ")") ||
          (content === "[" &&
            tokens[index + 3]?.content === "]" &&
            tokens[index + 4]?.content === "(" &&
            tokens[index + 6]?.content === ")")
        );
      } else if (annotations.length === 1) {
        const [{ type, end, start }] = annotations;
        return type === "link" && start === 0 && end === content.length;
      }
      return false;
    })
  ) {
    return reject;
  }
  const leftBracketIndices = tokens
    .map((token, index) => ({ token, index }))
    .filter(
      ({ token }) => token.content === "[" && token.annotations.length === 0
    );
  if (
    leftBracketIndices.some(({ index, token }) => {
      if (token.annotations.length === 0) {
        // TODO regex match or investigate ordered rules in nearley
        if (
          tokens[index + 2]?.content === "]" &&
          tokens[index + 3]?.content === "(" &&
          tokens[index + 5]?.content === ")"
        )
          return true;
        if (
          tokens[index + 1]?.content === "[" &&
          tokens[index + 3]?.content === "]" &&
          tokens[index + 4]?.content === "]"
        )
          return true;
      }
      return false;
    })
  ) {
    return reject;
  }
  return reduceTokens(data);
};

export const createReferenceToken: Processor<InitialSchema> = (_data) => {
  const [token] = _data as [moo.Token];
  const parts = token.value.slice(2, -2).split(":");
  const { notebookPageId, notebookUuid } =
    parts.length === 1
      ? { notebookPageId: parts[0], notebookUuid: getSetting("uuid") }
      : { notebookPageId: parts[1], notebookUuid: parts[0] };
  return {
    content: String.fromCharCode(0),
    annotations: [
      {
        type: "reference",
        start: 0,
        end: 1,
        attributes: {
          notebookPageId,
          notebookUuid,
        },
      } as Annotation,
    ],
  };
};

export const createWikilinkToken: Processor<InitialSchema> = (_data) => {
  const [, , , token] = _data as [
    moo.Token,
    moo.Token,
    moo.Token,
    InitialSchema,
    moo.Token,
    moo.Token
  ];
  return {
    content: String.fromCharCode(0),
    annotations: [
      {
        type: "reference",
        start: 0,
        end: 1,
        attributes: {
          notebookPageId: atJsonToRoam(token),
          notebookUuid: getSetting("uuid"),
        },
      } as Annotation,
    ],
  };
};

export const createHashtagToken: Processor<InitialSchema> = (_data) => {
  const [token] = _data as [moo.Token];
  return {
    content: String.fromCharCode(0),
    annotations: [
      {
        type: "reference",
        start: 0,
        end: 1,
        attributes: {
          notebookPageId: token.value.replace(/^#/, ""),
          notebookUuid: getSetting("uuid"),
        },
      } as Annotation,
    ],
  };
};

export default compileLexer(REGEXES);
