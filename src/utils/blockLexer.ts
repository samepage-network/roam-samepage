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
  openDoubleUnder: { match: /__(?=(?:[^_]|_[^_])*__)/, lineBreaks: true },
  openDoubleStar: { match: /\*\*(?=(?:[^*]|\*[^*])*\*\*)/, lineBreaks: true },
  openDoubleTilde: { match: /~~(?=(?:[^~]|~[^~])*~~)/, lineBreaks: true },
  openDoubleCarot: { match: /\^\^(?=(?:[^^]|\^[^^])*\^\^)/, lineBreaks: true },
  button: { match: /{{(?:[^}]|}(?!}))+}}/, lineBreaks: true },
  text: {
    match:
      // (plain text | alone left curl | alone right curl | alone under | alone asterisk | alone carot | alone tilde)
      /(?:[^^~_*#[\]()!{]|{(?!{(?:[^}]|}(?!}))+}})|_(?=[^_]+$)|\*(?=[^*]+$)|\^(?=[^^]+$)|~(?=[^~]+$))+/,
    lineBreaks: true,
  },
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
  const ref = token.value.replace(/^\(\(/, "").replace(/\)\)$/, "");
  return {
    content: String.fromCharCode(0),
    annotations: [
      {
        type: "reference",
        start: 0,
        end: 1,
        attributes: {
          notebookPageId: ref,
          notebookUuid: getSetting("uuid"),
        },
      } as Annotation,
    ],
  };
};

export const createButtonToken: Processor<InitialSchema> = (_data) => {
  const [token] = _data as [moo.Token];
  const data = token.value.replace(/^{{/, "").replace(/}}$/, "").split(":");
  if (data[0] === "samepage-reference") {
    return {
      content: String.fromCharCode(0),
      annotations: [
        {
          type: "reference",
          start: 0,
          end: 1,
          attributes: {
            notebookPageId: data.slice(2).join(":"),
            notebookUuid: data[1],
          },
        } as Annotation,
      ],
    };
  }
  return {
    content: token.value,
    annotations: [],
  };
};

export const createNull: Processor<InitialSchema> = () => ({
  content: String.fromCharCode(0),
  annotations: [],
});

export const createWikilinkToken: Processor<InitialSchema> = (
  _data,
  _,
  reject
) => {
  const [, , , token] = _data as [
    moo.Token,
    moo.Token,
    moo.Token,
    InitialSchema,
    moo.Token,
    moo.Token
  ];
  const notebookPageId = atJsonToRoam(token);
  const closing = notebookPageId.indexOf("]]");
  const opening = notebookPageId.indexOf("[[");
  if (closing >= 0 && (opening < 0 || closing < opening)) {
    return reject;
  }
  return {
    content: String.fromCharCode(0),
    annotations: [
      {
        type: "reference",
        start: 0,
        end: 1,
        attributes: {
          notebookPageId,
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
