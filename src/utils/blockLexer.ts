import { InitialSchema } from "samepage/types";
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
      const link = tokens[index + 1];
      if (!link) return false;
      const { annotations } = link;
      if (annotations.length === 0) {
        // TODO regex match or investigate ordered rules in nearley
        return link.content.startsWith("[](") && link.content.endsWith(")");
      } else if (annotations.length === 1) {
        const [{ type, end, start }] = annotations;
        return type === "link" && start === 0 && end === link.content.length;
      }
      return false;
    })
  ) {
    return reject;
  }
  return reduceTokens(data);
};

export default compileLexer();
