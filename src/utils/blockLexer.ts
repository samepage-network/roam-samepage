import { InitialSchema } from "samepage/internal/types";
import {
  compileLexer,
  Processor,
  reduceTokens,
} from "samepage/utils/atJsonTokens";

export const disambiguateTokens: Processor<InitialSchema> = (
  data,
  _,
  reject
) => {
  // keeping this here in case there are other Roam oddities we need to disambiguate
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
        return (
          tokens[index + 2]?.content === "]" &&
          tokens[index + 3]?.content === "(" &&
          tokens[index + 5]?.content === ")"
        );
      }
      return false;
    })
  ) {
    return reject;
  }
  return reduceTokens(data);
};

export default compileLexer();
