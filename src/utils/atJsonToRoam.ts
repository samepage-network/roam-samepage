import { getSetting } from "samepage/internal/registry";
import { InitialSchema } from "samepage/internal/types";
import renderAtJson from "samepage/utils/renderAtJson";

const atJsonToRoam = (state: InitialSchema) => {
  return renderAtJson({
    state,
    applyAnnotation: {
      bold: (_, content) => ({
        prefix: "**",
        suffix: `**`,
        replace: content === String.fromCharCode(0),
      }),
      highlighting: (_, content) => ({
        prefix: "^^",
        suffix: `^^`,
        replace: content === String.fromCharCode(0),
      }),
      italics: (_, content) => ({
        prefix: "__",
        suffix: `__`,
        replace: content === String.fromCharCode(0),
      }),
      strikethrough: (_, content) => ({
        prefix: "~~",
        suffix: `~~`,
        replace: content === String.fromCharCode(0),
      }),
      link: ({ href }) => ({
        prefix: "[",
        suffix: `](${href})`,
      }),
      image: ({ src }, content) => ({
        prefix: "![",
        suffix: `](${src})`,
        replace: content === String.fromCharCode(0),
      }),
      reference: ({ notebookPageId, notebookUuid }, content) => {
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
            suffix: `[[${notebookPageId}]]`,
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
