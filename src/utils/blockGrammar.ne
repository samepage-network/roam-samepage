@builtin "number.ne"
@builtin "whitespace.ne"
@preprocessor typescript

@{%
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
} from "./blockLexer";
%}

@lexer lexer

main -> tokens {% id %} | null {% createEmpty %}

tokens -> token:+ {% disambiguateTokens %}

token -> %openDoubleCarot (tokens {% id %} | null {% createNull %}) (%highlight | %openDoubleCarot) {% createHighlightingToken %}
   | %openDoubleTilde (tokens {% id %} | null {% createNull %}) (%strike | %openDoubleTilde) {% createStrikethroughToken %}
   | %openDoubleUnder (tokens {% id %} | null {% createNull %}) (%boldUnder | %openDoubleUnder) {% createItalicsToken %}
   | %openDoubleStar (tokens {% id %} | null {% createNull %}) (%boldStar | %openDoubleStar)  {% createBoldToken %}
   | %asset {% createAssetToken %}
   | %blockReference {% createReferenceToken %}
   | %hash:? %leftBracket %leftBracket tokens %rightBracket %rightBracket {% createWikilinkToken %}
   | %hashtag {% createHashtagToken %}
   | %button {% createButtonToken %}
   | %alias {% createAliasToken %}
   | %text {% createTextToken %}
   | %star  {% createTextToken %}
   | %carot  {% createTextToken %}
   | %tilde  {% createTextToken %}
   | %under  {% createTextToken %}
   | %highlight {% createTextToken %}
   | %strike {% createTextToken %}
   | %hash {% createTextToken %}
   | %boldUnder {% createTextToken %}
   | %boldStar {% createTextToken %}
   | %leftParen {% createTextToken %}
   | %leftBracket {% createTextToken %}
   | %rightParen {% createTextToken %}
   | %rightBracket {% createTextToken %}
   | %exclamationMark {% createTextToken %}
   | %url {% createTextToken %}
