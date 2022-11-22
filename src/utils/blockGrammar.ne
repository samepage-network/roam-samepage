@builtin "number.ne"
@builtin "whitespace.ne"
@preprocessor typescript

@{%
import { 
   compileLexer, 
   createBoldToken,
   createHighlightingToken,
   createItalicsToken,
   createStrikethroughToken,
   createTextToken,
   createImageToken,
   createLinkToken,
} from "samepage/utils/atJsonTokens";
import lexer, {
   disambiguateTokens,
   createReferenceToken,
   createWikilinkToken,
   createHashtagToken,
} from "./blockLexer";
%}

@lexer lexer

main -> tokens {% id %}

tokens -> token:+ {% disambiguateTokens %}

token -> %highlight tokens %highlight {% createHighlightingToken %}
   | %strike tokens %strike {% createStrikethroughToken %}
   | %boldUnder tokens %boldUnder {% createItalicsToken %}
   | %boldStar tokens %boldStar  {% createBoldToken %}
   | %leftBracket tokens %rightBracket %leftParen %url %rightParen {% createLinkToken %}
   | %exclamationMark %leftBracket (tokens {% id %} | null {% id %}) %rightBracket %leftParen %url %rightParen {% createImageToken %}
   | %blockReference {% createReferenceToken %}
   | %hash:? %leftBracket %leftBracket tokens %rightBracket %rightBracket {% createWikilinkToken %}
   | %hashtag {% createHashtagToken %}
   | %text {% createTextToken %}
   | %star  {% createTextToken %}
   | %carot  {% createTextToken %}
   | %tilde  {% createTextToken %}
   | %under  {% createTextToken %}
   | %hash {% createTextToken %}
   | %leftParen {% createTextToken %}
   | %leftBracket {% createTextToken %}
   | %rightParen {% createTextToken %}
   | %rightBracket {% createTextToken %}
   | %exclamationMark {% createTextToken %}
   | %url {% createTextToken %}
