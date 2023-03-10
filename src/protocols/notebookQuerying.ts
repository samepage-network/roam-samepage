import createButtonObserver from "roamjs-components/dom/createButtonObserver";
import { render as referenceRender } from "../components/ExternalNotebookReference";
import { OnloadArgs } from "roamjs-components/types/native";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import blockParser from "../utils/blockParser";
import setupNotebookQuerying from "samepage/protocols/notebookQuerying";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";

const load = (onloadArgs: OnloadArgs) => {
  const { unload } = setupNotebookQuerying({
    onQuery: async (notebookPageId: string) => {
      if (getPageUidByPageTitle(notebookPageId))
        return { content: notebookPageId, annotations: [] };
      return blockParser(getTextByBlockUid(notebookPageId));
    },
    onQueryResponse: async ({ data, request }) => {
      document.body.dispatchEvent(
        new CustomEvent("samepage:reference:response", {
          detail: {
            request,
            data,
          },
        })
      );
    },
  });
  const observer = createButtonObserver({
    render: (s) => {
      if (s.classList.contains("rm-xparser-default-samepage-reference")) {
        referenceRender(s);
      }
    },
    attribute: "samepage-reference",
  });
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Copy Cross Notebook Reference",
    callback: () => {
      const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()["block-uid"];
      window.navigator.clipboard.writeText(
        `((${onloadArgs.extensionAPI.settings.get("uuid")}:${blockUid}))`
      );
    },
  });
  return () => {
    unload();
    window.roamAlphaAPI.ui.commandPalette.removeCommand({
      label: "Copy Cross Notebook Reference",
    });
    observer?.disconnect();
  };
};

export default load;
