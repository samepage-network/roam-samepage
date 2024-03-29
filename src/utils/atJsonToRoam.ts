import { getSetting } from "samepage/internal/registry";
import { SamePageSchema } from "samepage/internal/types";
import renderAtJson from "samepage/utils/renderAtJson";

const atJsonToRoam = (state: SamePageSchema) => {
  return renderAtJson({
    state,
    applyAnnotation: {
      bold: ({ content }) => ({
        prefix: "**",
        suffix: `**`,
        replace: content === String.fromCharCode(0),
      }),
      highlighting: ({ content }) => ({
        prefix: "^^",
        suffix: `^^`,
        replace: content === String.fromCharCode(0),
      }),
      italics: ({ content }) => ({
        prefix: "__",
        suffix: `__`,
        replace: content === String.fromCharCode(0),
      }),
      strikethrough: ({ content }) => ({
        prefix: "~~",
        suffix: `~~`,
        replace: content === String.fromCharCode(0),
      }),
      link: ({ attributes: { href }, content }) => ({
        prefix: "[",
        suffix: `](${href})`,
        replace: content === String.fromCharCode(0),
      }),
      image: ({ attributes: { src }, content }) => ({
        prefix: "![",
        suffix: `](${src})`,
        replace: content === String.fromCharCode(0),
      }),
      reference: ({
        attributes: { notebookPageId, notebookUuid },
        content,
        appAttributes: { kind },
      }) => {
        const replace = content === String.fromCharCode(0);
        if (notebookUuid === getSetting("uuid")) {
          const pull = window.roamAlphaAPI.pull("[:db/id]", [
            ":block/uid",
            notebookPageId,
          ]);
          if (!!pull) {
            return {
              prefix: "",
              suffix: `((${notebookPageId}))`,
              replace,
            };
          }
          return {
            prefix: "",
            suffix:
              kind === "hash-wikilink"
                ? `#[[${notebookPageId}]]`
                : kind === "hash"
                ? `#${notebookPageId}`
                : `[[${notebookPageId}]]`,
            replace,
          };
        }
        return {
          replace,
          prefix: "",
          suffix: `{{samepage-reference:${notebookUuid}:${notebookPageId}}}`,
        };
      },
      code: ({ attributes: { language }, appAttributes }) => {
        return {
          prefix: `\`\`\`${
            appAttributes.defaulted === "true" ? "" : language
          }\n`,
          suffix: "```",
        };
      },
    },
  });
};

export default atJsonToRoam;
