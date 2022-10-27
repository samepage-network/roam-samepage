import { OnloadArgs } from "roamjs-components/types";
import { InitialSchema } from "samepage/internal/types";
import renderAtJson from "samepage/utils/renderAtJson";

const atJsonToRoam = (state: InitialSchema, onloadArgs: OnloadArgs) => {
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
      reference: ({ notebookPageId, notebookUuid }, content) => ({
        prefix: "((",
        suffix: `${
          notebookUuid === onloadArgs.extensionAPI.settings.get("uuid")
            ? notebookPageId
            : `${notebookUuid}:${notebookPageId}`
        }))`,
        replace: content === String.fromCharCode(0),
      }),
    },
  });
};

export default atJsonToRoam;
