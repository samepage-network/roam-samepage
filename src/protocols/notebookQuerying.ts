import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import { render as referenceRender } from "../components/ExternalNotebookReference";
import { OnloadArgs } from "roamjs-components/types/native";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import atJsonParser from "samepage/utils/atJsonParser";
// @ts-ignore for now until we fix types
import blockGrammar from "../utils/blockGrammar.ne";
import setupNotebookQuerying from "samepage/protocols/notebookQuerying";

const load = (onloadArgs: OnloadArgs) => {
  const { unload } = setupNotebookQuerying({
    onQuery: async (notebookPageId: string) => {
      return atJsonParser(blockGrammar, getTextByBlockUid(notebookPageId));
    },
    onQueryResponse: async ({ data, request }) => {
      document.body.dispatchEvent(
        new CustomEvent("samepage:reference", {
          detail: {
            request,
            data,
          },
        })
      );
    },
  });
  const observer = createHTMLObserver({
    callback: (s) => referenceRender(s, onloadArgs),
    tag: "SPAN",
    className: "rm-paren--closed",
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
