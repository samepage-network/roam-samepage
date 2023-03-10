import { getSetting } from "samepage/internal/registry";
import { Annotation, InitialSchema } from "samepage/internal/types";
import atJsonParser, {
  combineAtJsons,
  createEmptyAtJson,
  createTextAtJson,
  head,
  NULL_TOKEN,
  URL_REGEX,
} from "samepage/utils/atJsonParser";
import atJsonToRoam from "./atJsonToRoam";

type Rule = Parameters<typeof atJsonParser>[0]["grammarRules"][number];

const createTextRule = ({
  type,
  ruleName,
}: {
  type: string;
  ruleName: string;
}): Rule => ({
  name: ruleName,
  symbols: [{ type }],
  postprocess: createTextAtJson,
});

const baseRules: Rule[] = [
  { name: "main", symbols: [], postprocess: createEmptyAtJson },
  { name: "main", symbols: ["blockElements"], postprocess: head },
  { name: "blockElements", symbols: ["blockElement"], postprocess: head },
  {
    name: "blockElements",
    symbols: ["blockElement", "blockElements"],
    postprocess: combineAtJsons,
  },
  {
    name: "main",
    symbols: ["blockElements", "lastElement"],
    postprocess: combineAtJsons,
  },
  {
    name: "main",
    symbols: ["lastElement"],
    postprocess: head,
  },

  {
    name: "blockElement",
    symbols: [{ type: "highlight" }, "highlightBody", { type: "highlight" }],
    postprocess: (data) => {
      const [token, first] = data as [moo.Token, InitialSchema, InitialSchema];
      const highlight: InitialSchema = {
        content: first.content,
        annotations: (
          [
            {
              type: "highlighting",
              start: 0,
              end: first.content.length,
              attributes: {
                delimiter: token.value,
              },
            },
          ] as InitialSchema["annotations"]
        ).concat(first.annotations),
      };
      return highlight;
    },
  },
  {
    name: "highlightBody",
    symbols: ["noDoubleCarots"],
    postprocess: head,
  },
  {
    name: "noDoubleCarots",
    symbols: ["noDoubleCarot", "noDoubleCarots"],
    postprocess: combineAtJsons,
  },
  {
    name: "noDoubleCarots",
    symbols: ["noDoubleCarot"],
    postprocess: head,
  },
  {
    name: "highlightBody",
    symbols: [],
    postprocess: () => ({ content: NULL_TOKEN, annotations: [] }),
  },
  {
    name: "lastElement",
    symbols: [{ type: "highlight" }, "noDoubleCarots"],
    postprocess: (data) => {
      const [, json] = data as [moo.Token, InitialSchema];
      return combineAtJsons([{ content: "^^", annotations: [] }, json]);
    },
  },
  {
    name: "lastElement",
    symbols: [{ type: "highlight" }],
    postprocess: createTextAtJson,
  },

  {
    name: "blockElement",
    symbols: [{ type: "strike" }, "strikeExpression", { type: "strike" }],
    postprocess: (data) => {
      const [token, first] = data as [moo.Token, InitialSchema, moo.Token];
      return {
        content: first.content,
        annotations: (
          [
            {
              type: "strikethrough",
              start: 0,
              end: first.content.length,
              attributes: {
                delimiter: token.value,
              },
            },
          ] as InitialSchema["annotations"]
        ).concat(first.annotations),
      };
    },
  },
  {
    name: "strikeExpression",
    symbols: ["noDoubleTildes"],
    postprocess: head,
  },
  {
    name: "strikeExpression",
    symbols: [],
    postprocess: () => ({ content: NULL_TOKEN, annotations: [] }),
  },
  {
    name: "noDoubleTildes",
    symbols: ["noDoubleTilde", "noDoubleTildes"],
    postprocess: combineAtJsons,
  },
  {
    name: "noDoubleTildes",
    symbols: ["noDoubleTilde"],
    postprocess: head,
  },
  {
    name: "lastElement",
    symbols: [{ type: "strike" }, "noDoubleTildes"],
    postprocess: (data) => {
      const [, json] = data as [moo.Token, InitialSchema];
      return combineAtJsons([{ content: "~~", annotations: [] }, json]);
    },
  },
  {
    name: "lastElement",
    symbols: [{ type: "strike" }],
    postprocess: createTextAtJson,
  },

  {
    name: "blockElement",
    symbols: [
      { type: "doubleUnder" },
      "doubleUnderExpression",
      { type: "doubleUnder" },
    ],
    postprocess: (data) => {
      const [_, first] = data as [moo.Token, InitialSchema, InitialSchema];
      return {
        content: first.content,
        annotations: (
          [
            {
              type: "italics",
              start: 0,
              end: first.content.length,
              attributes: {
                delimiter: "__",
              },
            },
          ] as InitialSchema["annotations"]
        ).concat(first.annotations),
      };
    },
  },
  {
    name: "doubleUnderExpression",
    symbols: ["noDoubleUnders"],
    postprocess: head,
  },
  {
    name: "doubleUnderExpression",
    symbols: [],
    postprocess: () => ({ content: NULL_TOKEN, annotations: [] }),
  },
  {
    name: "noDoubleUnders",
    symbols: ["noDoubleUnder", "noDoubleUnders"],
    postprocess: combineAtJsons,
  },
  {
    name: "noDoubleUnders",
    symbols: ["noDoubleUnder"],
    postprocess: head,
  },
  {
    name: "lastElement",
    symbols: [{ type: "doubleUnder" }, "noDoubleUnders"],
    postprocess: (data) => {
      const [, json] = data as [moo.Token, InitialSchema];
      return combineAtJsons([{ content: "__", annotations: [] }, json]);
    },
  },
  {
    name: "lastElement",
    symbols: [{ type: "doubleUnder" }],
    postprocess: createTextAtJson,
  },

  {
    name: "blockElement",
    symbols: [
      { type: "doubleStar" },
      "doubleStarExpression",
      { type: "doubleStar" },
    ],
    postprocess: (data) => {
      const [token, first] = data as [moo.Token, InitialSchema, InitialSchema];
      return {
        content: first.content,
        annotations: (
          [
            {
              type: "bold",
              start: 0,
              end: first.content.length,
              attributes: {
                delimiter: token.value,
              },
            },
          ] as InitialSchema["annotations"]
        ).concat(first.annotations),
      };
    },
  },
  {
    name: "doubleStarExpression",
    symbols: ["noDoubleStars"],
    postprocess: head,
  },
  {
    name: "doubleStarExpression",
    symbols: [],
    postprocess: () => ({ content: NULL_TOKEN, annotations: [] }),
  },
  {
    name: "noDoubleStars",
    symbols: ["noDoubleStar", "noDoubleStars"],
    postprocess: combineAtJsons,
  },
  {
    name: "noDoubleStars",
    symbols: ["noDoubleStar"],
    postprocess: head,
  },
  {
    name: "lastElement",
    symbols: [{ type: "doubleStar" }, "noDoubleStars"],
    postprocess: (data) => {
      const [, json] = data as [moo.Token, InitialSchema];
      return combineAtJsons([{ content: "**", annotations: [] }, json]);
    },
  },
  {
    name: "lastElement",
    symbols: [{ type: "doubleStar" }],
    postprocess: createTextAtJson,
  },

  {
    name: "blockElement",
    symbols: [{ type: "asset" }],
    postprocess: (data) => {
      const { value } = (data as [moo.Token])[0];
      const arr = /!\[([^\]]*)\]\(([^\)]*)\)/.exec(value);
      if (!arr) {
        return {
          content: "",
          annotations: [],
        };
      }
      const [_, _content, src] = arr;
      const content = _content || String.fromCharCode(0);
      return {
        content,
        annotations: [
          {
            start: 0,
            end: content.length,
            type: "image",
            attributes: {
              src,
            },
          },
        ],
      };
    },
  },
  {
    name: "blockElement",
    symbols: [{ type: "blockReference" }],
    postprocess: (data) => {
      const [token] = data as [moo.Token];
      const notebookPageId = token.value.slice(2, -2);
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
    },
  },
  {
    name: "blockElement",
    symbols: [
      { type: "hashDoubleLeftBracket" },
      "noDoubleRightBrackets",
      { type: "doubleRightBracket" },
    ],
    postprocess: (data, _, reject) => {
      const [, token] = data as [moo.Token, InitialSchema, moo.Token];
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
            appAttributes: {
              roam: {
                kind: "hash-wikilink",
              },
            },
          } as Annotation,
        ],
      };
    },
  },
  {
    name: "blockElement",
    symbols: [
      { type: "doubleLeftBracket" },
      "noDoubleRightBrackets",
      { type: "doubleRightBracket" },
    ],
    postprocess: (data, _, reject) => {
      const [, token] = data as [moo.Token, InitialSchema, moo.Token];
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
            appAttributes: {
              roam: {
                kind: "wikilink",
              },
            },
          } as Annotation,
        ],
      };
    },
  },
  {
    name: "blockElement",
    symbols: [{ type: "hashtag" }],
    postprocess: (data) => {
      const [token] = data as [moo.Token];
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
            appAttributes: {
              roam: {
                kind: "hash",
              },
            },
          } as Annotation,
        ],
      };
    },
  },
  {
    name: "blockElement",
    symbols: [{ type: "button" }],
    postprocess: (_data) => {
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
    },
  },
  {
    name: "blockElement",
    symbols: [{ type: "alias" }],
    postprocess: (data) => {
      const { value } = (data as [moo.Token])[0];
      const arr = /\[([^\]]*)\]\(([^\)]*)\)/.exec(value);
      if (!arr) {
        return {
          content: "",
          annotations: [],
        };
      }
      const [_, _content, href] = arr;
      const content = _content || String.fromCharCode(0);
      return {
        content,
        annotations: [
          {
            start: 0,
            end: content.length,
            type: "link",
            attributes: {
              href,
            },
          },
        ],
      };
    },
  },
  {
    name: "blockElement",
    symbols: [{ type: "codeBlock" }],
    postprocess: (data) => {
      const { value } = (data as [moo.Token])[0];
      const languageParsed = /^```([\w ]*)\n/.exec(value)?.[1]?.trim?.();
      const language = languageParsed || "javascript";
      const content = value.replace(/^```[\w ]*\n/, "").replace(/```$/, "");
      return {
        content,
        annotations: [
          {
            start: 0,
            end: content.length,
            type: "code",
            attributes: {
              language,
            },
            appAttributes: {
              roam: { defaulted: `${!languageParsed}` },
            },
          },
        ],
      };
    },
  },
  {
    name: "blockElement",
    symbols: [{ type: "attribute" }],
    postprocess: createEmptyAtJson,
  },
  {
    name: "lastElement",
    symbols: [{ type: "doubleLeftBracket" }],
    postprocess: createTextAtJson,
  },
  {
    name: "lastElement",
    symbols: [{ type: "doubleLeftBracket" }, "noDoubleRightBrackets"],
    postprocess: (data) => {
      const [, json] = data as [moo.Token, InitialSchema];
      return combineAtJsons([{ content: "[[", annotations: [] }, json]);
    },
  },
  {
    name: "noDoubleRightBrackets",
    symbols: ["noDoubleRightBracket", "noDoubleRightBrackets"],
    postprocess: combineAtJsons,
  },
  {
    name: "noDoubleRightBrackets",
    symbols: ["noDoubleRightBracket"],
    postprocess: head,
  },
  ...[
    "text",
    "star",
    "carot",
    "tilde",
    "under",
    "hash",
    "leftParen",
    "leftBracket",
    "rightParen",
    "rightBracket",
    "doubleRightBracket",
    "newLine",
    "exclamationMark",
    "url",
  ].map((type) => createTextRule({ ruleName: "blockElement", type })),
];

const noDoubleRightBracketRules = baseRules
  .filter((b) => {
    const [symbol] = b.symbols;
    return (
      b.name === "blockElement" &&
      typeof symbol === "object" &&
      symbol.type !== "doubleRightBracket"
    );
  })
  .map((r) => ({ ...r, name: "noDoubleRightBracket" }));
const noDoubleCarotRules = baseRules
  .filter((b) => {
    const [symbol] = b.symbols;
    return (
      b.name === "blockElement" &&
      typeof symbol === "object" &&
      !(symbol.type === "highlight" && b.symbols.length === 3)
    );
  })
  .map((r) => ({ ...r, name: "noDoubleCarot" }));
const noDoubleTildeRules = baseRules
  .filter((b) => {
    const [symbol] = b.symbols;
    return (
      b.name === "blockElement" &&
      typeof symbol === "object" &&
      !(symbol.type === "strike" && b.symbols.length === 3)
    );
  })
  .map((r) => ({ ...r, name: "noDoubleTilde" }));
const noDoubleUnderRules = baseRules
  .filter((b) => {
    const [symbol] = b.symbols;
    return (
      b.name === "blockElement" &&
      typeof symbol === "object" &&
      !(symbol.type === "doubleUnder" && b.symbols.length === 3)
    );
  })
  .map((r) => ({ ...r, name: "noDoubleUnder" }));
const noDoubleStarRules = baseRules
  .filter((b) => {
    const [symbol] = b.symbols;
    return (
      b.name === "blockElement" &&
      typeof symbol === "object" &&
      !(symbol.type === "doubleStar" && b.symbols.length === 3)
    );
  })
  .map((r) => ({ ...r, name: "noDoubleStar" }));
const grammarRules: Rule[] = baseRules
  .concat(noDoubleCarotRules)
  .concat(noDoubleTildeRules)
  .concat(noDoubleUnderRules)
  .concat(noDoubleStarRules)
  .concat(noDoubleRightBracketRules);

const blockParser = atJsonParser({
  lexerRules: {
    alias: /\[[^\]]*\]\([^\)]*\)/,
    asset: /!\[[^\]]*\]\([^\)]*\)/,
    url: URL_REGEX,
    blockReference: /\(\([^)]*\)\)/,
    hashDoubleLeftBracket: "#[[",
    hashtag: /#[a-zA-Z0-9_.-]+/,
    hash: /#/,
    codeBlock: {
      match: /```[\w ]*\n(?:[^`]|`(?!``)|``(?!`))*```/,
      lineBreaks: true,
    },
    button: { match: /{{(?:[^}]|}(?!}))+}}/, lineBreaks: true },
    text: {
      match:
        // (plain text | alone left curl | alone right curl | alone under | alone asterisk | alone carot | alone tilde | backtick not followed by two more | two backticks not followed by one more)
        /(?:[^^~_*#[\]()!{`]|{(?!{(?:[^}]|}(?!}))+}})|_(?=[^_]+$)|\*(?=[^*]+$)|\^(?=[^^]+$)|~(?=[^~]+$)|`(?!``)|``(?!`))+/,
      lineBreaks: true,
    },
    highlight: "^^",
    strike: "~~",
    doubleUnder: "__",
    doubleStar: "**",
    under: "_",
    star: "*",
    tilde: "~",
    carot: "^",
    doubleLeftBracket: "[[",
    doubleRightBracket: "]]",
    leftBracket: "[",
    leftParen: "(",
    rightBracket: "]",
    rightParen: ")",
    exclamationMark: "!",
  },
  grammarRules,
});

export default blockParser;
