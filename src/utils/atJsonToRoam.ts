import { getSetting } from "samepage/internal/registry";
import { InitialSchema } from "samepage/internal/types";
import renderAtJson from "samepage/utils/renderAtJson";

const atJsonToRoam = (state: InitialSchema) => {
  return renderAtJson({
    state,
    applyAnnotation: {
      bold: {
        prefix: "**",
        suffix: `**`,
      },
      highlighting: {
        prefix: "^^",
        suffix: `^^`,
      },
      italics: {
        prefix: "__",
        suffix: `__`,
      },
      strikethrough: {
        prefix: "~~",
        suffix: `~~`,
      },
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
          if (!!window.roamAlphaAPI.pull("[:db/id]", [":block/uid", "*"])) {
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
          suffix: `((${notebookUuid}:${notebookPageId}))`,
        };
      },
    },
  });
};

export default atJsonToRoam;
