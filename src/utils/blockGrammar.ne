@builtin "number.ne"
@builtin "whitespace.ne"
@preprocessor typescript

@{%
import { 
   compileLexer, 
   createBoldToken,
   createHighlightingToken,
   createItalicsToken,
   createLinkToken,
   createStrikethroughToken,
   createTextToken,
   disambiguateTokens,
} from "samepage/utils/atJsonTokens";

const lexer = compileLexer({});
%}

@lexer lexer

main -> tokens {% id %}

tokens -> token:+ {% disambiguateTokens %}

token -> %highlight tokens %highlight {% createHighlightingToken %}
   | %strike tokens %strike {% createStrikethroughToken %}
   | %boldUnder tokens %boldUnder {% createItalicsToken %}
   | %boldStar tokens %boldStar  {% createBoldToken %}
   | %leftBracket tokens %rightBracket %leftParen %url %rightParen {% createLinkToken %}
   | %text {% createTextToken %}
   | %star  {% createTextToken %}
   | %carot  {% createTextToken %}
   | %tilde  {% createTextToken %}
   | %under  {% createTextToken %}
   | %leftParen {% createTextToken %}
   | %leftBracket {% createTextToken %}
   | %rightParen {% createTextToken %}
   | %rightBracket {% createTextToken %}
