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
   createLinkToken,
} from "samepage/utils/atJsonTokens";
import lexer, {
   disambiguateTokens,
   createReferenceToken,
   createWikilinkToken,
   createHashtagToken,
   createButtonToken,
} from "./blockLexer";
%}

@lexer lexer

main -> tokens {% id %} | null {% createEmpty %}

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
   | %button {% createButtonToken %}
   | %text {% createTextToken %}
   | %star  {% createTextToken %}
   | %carot  {% createTextToken %}
   | %tilde  {% createTextToken %}
   | %under  {% createTextToken %}
   | %hash {% createTextToken %}
   | %boldUnder {% createTextToken %}
   | %boldStar {% createTextToken %}
   | %leftParen {% createTextToken %}
   | %leftBracket {% createTextToken %}
   | %rightParen {% createTextToken %}
   | %rightBracket {% createTextToken %}
   | %exclamationMark {% createTextToken %}
   | %url {% createTextToken %}
