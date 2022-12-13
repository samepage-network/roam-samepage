// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d: any[]): any { return d[0]; }
declare var openDoubleCarot: any;
declare var highlight: any;
declare var openDoubleTilde: any;
declare var strike: any;
declare var openDoubleUnder: any;
declare var boldUnder: any;
declare var openDoubleStar: any;
declare var boldStar: any;
declare var asset: any;
declare var blockReference: any;
declare var hash: any;
declare var leftBracket: any;
declare var rightBracket: any;
declare var hashtag: any;
declare var button: any;
declare var alias: any;
declare var codeBlock: any;
declare var text: any;
declare var star: any;
declare var carot: any;
declare var tilde: any;
declare var under: any;
declare var leftParen: any;
declare var rightParen: any;
declare var exclamationMark: any;
declare var url: any;

import { 
   compileLexer, 
   createBoldToken,
   createEmpty,
   createHighlightingToken,
   createItalicsToken,
   createStrikethroughToken,
   createTextToken,
   createImageToken,
} from "samepage/utils/atJsonTokens";
import lexer, {
   disambiguateTokens,
   createReferenceToken,
   createWikilinkToken,
   createHashtagToken,
   createButtonToken,
   createNull,
   createAliasToken,
   createAssetToken,
   createCodeBlockToken,
} from "./blockLexer";

interface NearleyToken {
  value: any;
  [key: string]: any;
};

interface NearleyLexer {
  reset: (chunk: string, info: any) => void;
  next: () => NearleyToken | undefined;
  save: () => any;
  formatError: (token: never) => string;
  has: (tokenType: string) => boolean;
};

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
};

type NearleySymbol = string | { literal: any } | { test: (token: any) => boolean };

interface Grammar {
  Lexer: NearleyLexer | undefined;
  ParserRules: NearleyRule[];
  ParserStart: string;
};

const grammar: Grammar = {
  Lexer: lexer,
  ParserRules: [
    {"name": "unsigned_int$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "unsigned_int$ebnf$1", "symbols": ["unsigned_int$ebnf$1", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "unsigned_int", "symbols": ["unsigned_int$ebnf$1"], "postprocess": 
        function(d) {
            return parseInt(d[0].join(""));
        }
        },
    {"name": "int$ebnf$1$subexpression$1", "symbols": [{"literal":"-"}]},
    {"name": "int$ebnf$1$subexpression$1", "symbols": [{"literal":"+"}]},
    {"name": "int$ebnf$1", "symbols": ["int$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "int$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "int$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "int$ebnf$2", "symbols": ["int$ebnf$2", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "int", "symbols": ["int$ebnf$1", "int$ebnf$2"], "postprocess": 
        function(d) {
            if (d[0]) {
                return parseInt(d[0][0]+d[1].join(""));
            } else {
                return parseInt(d[1].join(""));
            }
        }
        },
    {"name": "unsigned_decimal$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "unsigned_decimal$ebnf$1", "symbols": ["unsigned_decimal$ebnf$1", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "unsigned_decimal$ebnf$2$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "unsigned_decimal$ebnf$2$subexpression$1$ebnf$1", "symbols": ["unsigned_decimal$ebnf$2$subexpression$1$ebnf$1", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "unsigned_decimal$ebnf$2$subexpression$1", "symbols": [{"literal":"."}, "unsigned_decimal$ebnf$2$subexpression$1$ebnf$1"]},
    {"name": "unsigned_decimal$ebnf$2", "symbols": ["unsigned_decimal$ebnf$2$subexpression$1"], "postprocess": id},
    {"name": "unsigned_decimal$ebnf$2", "symbols": [], "postprocess": () => null},
    {"name": "unsigned_decimal", "symbols": ["unsigned_decimal$ebnf$1", "unsigned_decimal$ebnf$2"], "postprocess": 
        function(d) {
            return parseFloat(
                d[0].join("") +
                (d[1] ? "."+d[1][1].join("") : "")
            );
        }
        },
    {"name": "decimal$ebnf$1", "symbols": [{"literal":"-"}], "postprocess": id},
    {"name": "decimal$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "decimal$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "decimal$ebnf$2", "symbols": ["decimal$ebnf$2", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "decimal$ebnf$3$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "decimal$ebnf$3$subexpression$1$ebnf$1", "symbols": ["decimal$ebnf$3$subexpression$1$ebnf$1", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "decimal$ebnf$3$subexpression$1", "symbols": [{"literal":"."}, "decimal$ebnf$3$subexpression$1$ebnf$1"]},
    {"name": "decimal$ebnf$3", "symbols": ["decimal$ebnf$3$subexpression$1"], "postprocess": id},
    {"name": "decimal$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "decimal", "symbols": ["decimal$ebnf$1", "decimal$ebnf$2", "decimal$ebnf$3"], "postprocess": 
        function(d) {
            return parseFloat(
                (d[0] || "") +
                d[1].join("") +
                (d[2] ? "."+d[2][1].join("") : "")
            );
        }
        },
    {"name": "percentage", "symbols": ["decimal", {"literal":"%"}], "postprocess": 
        function(d) {
            return d[0]/100;
        }
        },
    {"name": "jsonfloat$ebnf$1", "symbols": [{"literal":"-"}], "postprocess": id},
    {"name": "jsonfloat$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "jsonfloat$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "jsonfloat$ebnf$2", "symbols": ["jsonfloat$ebnf$2", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "jsonfloat$ebnf$3$subexpression$1$ebnf$1", "symbols": [/[0-9]/]},
    {"name": "jsonfloat$ebnf$3$subexpression$1$ebnf$1", "symbols": ["jsonfloat$ebnf$3$subexpression$1$ebnf$1", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "jsonfloat$ebnf$3$subexpression$1", "symbols": [{"literal":"."}, "jsonfloat$ebnf$3$subexpression$1$ebnf$1"]},
    {"name": "jsonfloat$ebnf$3", "symbols": ["jsonfloat$ebnf$3$subexpression$1"], "postprocess": id},
    {"name": "jsonfloat$ebnf$3", "symbols": [], "postprocess": () => null},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$1", "symbols": [/[+-]/], "postprocess": id},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$2", "symbols": [/[0-9]/]},
    {"name": "jsonfloat$ebnf$4$subexpression$1$ebnf$2", "symbols": ["jsonfloat$ebnf$4$subexpression$1$ebnf$2", /[0-9]/], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "jsonfloat$ebnf$4$subexpression$1", "symbols": [/[eE]/, "jsonfloat$ebnf$4$subexpression$1$ebnf$1", "jsonfloat$ebnf$4$subexpression$1$ebnf$2"]},
    {"name": "jsonfloat$ebnf$4", "symbols": ["jsonfloat$ebnf$4$subexpression$1"], "postprocess": id},
    {"name": "jsonfloat$ebnf$4", "symbols": [], "postprocess": () => null},
    {"name": "jsonfloat", "symbols": ["jsonfloat$ebnf$1", "jsonfloat$ebnf$2", "jsonfloat$ebnf$3", "jsonfloat$ebnf$4"], "postprocess": 
        function(d) {
            return parseFloat(
                (d[0] || "") +
                d[1].join("") +
                (d[2] ? "."+d[2][1].join("") : "") +
                (d[3] ? "e" + (d[3][1] || "+") + d[3][2].join("") : "")
            );
        }
        },
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", "wschar"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": function(d) {return null;}},
    {"name": "__$ebnf$1", "symbols": ["wschar"]},
    {"name": "__$ebnf$1", "symbols": ["__$ebnf$1", "wschar"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "__", "symbols": ["__$ebnf$1"], "postprocess": function(d) {return null;}},
    {"name": "wschar", "symbols": [/[ \t\n\v\f]/], "postprocess": id},
    {"name": "main", "symbols": ["tokens"], "postprocess": id},
    {"name": "main", "symbols": [], "postprocess": createEmpty},
    {"name": "tokens$ebnf$1", "symbols": ["token"]},
    {"name": "tokens$ebnf$1", "symbols": ["tokens$ebnf$1", "token"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "tokens", "symbols": ["tokens$ebnf$1"], "postprocess": disambiguateTokens},
    {"name": "token$subexpression$1", "symbols": ["tokens"], "postprocess": id},
    {"name": "token$subexpression$1", "symbols": [], "postprocess": createNull},
    {"name": "token$subexpression$2", "symbols": [(lexer.has("highlight") ? {type: "highlight"} : highlight)]},
    {"name": "token$subexpression$2", "symbols": [(lexer.has("openDoubleCarot") ? {type: "openDoubleCarot"} : openDoubleCarot)]},
    {"name": "token", "symbols": [(lexer.has("openDoubleCarot") ? {type: "openDoubleCarot"} : openDoubleCarot), "token$subexpression$1", "token$subexpression$2"], "postprocess": createHighlightingToken},
    {"name": "token$subexpression$3", "symbols": ["tokens"], "postprocess": id},
    {"name": "token$subexpression$3", "symbols": [], "postprocess": createNull},
    {"name": "token$subexpression$4", "symbols": [(lexer.has("strike") ? {type: "strike"} : strike)]},
    {"name": "token$subexpression$4", "symbols": [(lexer.has("openDoubleTilde") ? {type: "openDoubleTilde"} : openDoubleTilde)]},
    {"name": "token", "symbols": [(lexer.has("openDoubleTilde") ? {type: "openDoubleTilde"} : openDoubleTilde), "token$subexpression$3", "token$subexpression$4"], "postprocess": createStrikethroughToken},
    {"name": "token$subexpression$5", "symbols": ["tokens"], "postprocess": id},
    {"name": "token$subexpression$5", "symbols": [], "postprocess": createNull},
    {"name": "token$subexpression$6", "symbols": [(lexer.has("boldUnder") ? {type: "boldUnder"} : boldUnder)]},
    {"name": "token$subexpression$6", "symbols": [(lexer.has("openDoubleUnder") ? {type: "openDoubleUnder"} : openDoubleUnder)]},
    {"name": "token", "symbols": [(lexer.has("openDoubleUnder") ? {type: "openDoubleUnder"} : openDoubleUnder), "token$subexpression$5", "token$subexpression$6"], "postprocess": createItalicsToken},
    {"name": "token$subexpression$7", "symbols": ["tokens"], "postprocess": id},
    {"name": "token$subexpression$7", "symbols": [], "postprocess": createNull},
    {"name": "token$subexpression$8", "symbols": [(lexer.has("boldStar") ? {type: "boldStar"} : boldStar)]},
    {"name": "token$subexpression$8", "symbols": [(lexer.has("openDoubleStar") ? {type: "openDoubleStar"} : openDoubleStar)]},
    {"name": "token", "symbols": [(lexer.has("openDoubleStar") ? {type: "openDoubleStar"} : openDoubleStar), "token$subexpression$7", "token$subexpression$8"], "postprocess": createBoldToken},
    {"name": "token", "symbols": [(lexer.has("asset") ? {type: "asset"} : asset)], "postprocess": createAssetToken},
    {"name": "token", "symbols": [(lexer.has("blockReference") ? {type: "blockReference"} : blockReference)], "postprocess": createReferenceToken},
    {"name": "token$ebnf$1", "symbols": [(lexer.has("hash") ? {type: "hash"} : hash)], "postprocess": id},
    {"name": "token$ebnf$1", "symbols": [], "postprocess": () => null},
    {"name": "token", "symbols": ["token$ebnf$1", (lexer.has("leftBracket") ? {type: "leftBracket"} : leftBracket), (lexer.has("leftBracket") ? {type: "leftBracket"} : leftBracket), "tokens", (lexer.has("rightBracket") ? {type: "rightBracket"} : rightBracket), (lexer.has("rightBracket") ? {type: "rightBracket"} : rightBracket)], "postprocess": createWikilinkToken},
    {"name": "token", "symbols": [(lexer.has("hashtag") ? {type: "hashtag"} : hashtag)], "postprocess": createHashtagToken},
    {"name": "token", "symbols": [(lexer.has("button") ? {type: "button"} : button)], "postprocess": createButtonToken},
    {"name": "token", "symbols": [(lexer.has("alias") ? {type: "alias"} : alias)], "postprocess": createAliasToken},
    {"name": "token", "symbols": [(lexer.has("codeBlock") ? {type: "codeBlock"} : codeBlock)], "postprocess": createCodeBlockToken},
    {"name": "token", "symbols": [(lexer.has("text") ? {type: "text"} : text)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("star") ? {type: "star"} : star)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("carot") ? {type: "carot"} : carot)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("tilde") ? {type: "tilde"} : tilde)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("under") ? {type: "under"} : under)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("highlight") ? {type: "highlight"} : highlight)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("strike") ? {type: "strike"} : strike)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("hash") ? {type: "hash"} : hash)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("boldUnder") ? {type: "boldUnder"} : boldUnder)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("boldStar") ? {type: "boldStar"} : boldStar)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("leftParen") ? {type: "leftParen"} : leftParen)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("leftBracket") ? {type: "leftBracket"} : leftBracket)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("rightParen") ? {type: "rightParen"} : rightParen)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("rightBracket") ? {type: "rightBracket"} : rightBracket)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("exclamationMark") ? {type: "exclamationMark"} : exclamationMark)], "postprocess": createTextToken},
    {"name": "token", "symbols": [(lexer.has("url") ? {type: "url"} : url)], "postprocess": createTextToken}
  ],
  ParserStart: "main",
};

export default grammar;
