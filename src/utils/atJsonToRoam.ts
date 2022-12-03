import { getSetting } from "samepage/internal/registry";
import { InitialSchema } from "samepage/internal/types";
import renderAtJson from "samepage/utils/renderAtJson";

const atJsonToRoam = (state: InitialSchema) => {
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
      link: ({ attributes: { href } }) => ({
        prefix: "[",
        suffix: `](${href})`,
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
    },
  });
};

export default atJsonToRoam;
