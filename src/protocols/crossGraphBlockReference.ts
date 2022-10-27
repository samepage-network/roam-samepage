import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import {
  render as referenceRender,
} from "../components/CrossGraphReference";
import apiClient from "samepage/internal/apiClient";
import { OnloadArgs } from "roamjs-components/types/native";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import atJsonParser from "samepage/utils/atJsonParser";
import blockGrammar from "../utils/blockGrammar";
import { InitialSchema } from "samepage/internal/types";

const load = (
  { addNotebookListener, removeNotebookListener }: typeof window.samepage,
  onloadArgs: OnloadArgs
) => {
  addNotebookListener({
    operation: "QUERY",
    handler: (e, source) => {
      const { request } = e as { request: string };
      const [, notebookPageId] = request.split(":");
      const data = atJsonParser(
        blockGrammar,
        getTextByBlockUid(notebookPageId)
      );
      apiClient({
        method: "query-response",
        request,
        response: JSON.stringify({
          found: !!window.roamAlphaAPI.pull("[:db/id]", [
            ":block/uid",
            notebookPageId,
          ]),
          data,
        }),
        target: source.uuid,
      });
    },
  });
  addNotebookListener({
    operation: "QUERY_RESPONSE",
    handler: (e) => {
      const { found, data, request } = e as {
        found: boolean;
        data: InitialSchema;
        request: string;
      };
      const newData = found
        ? data
        : { content: `Notebook reference not found`, annotations: [] };
      document.body.dispatchEvent(
        new CustomEvent("samepage:reference", {
          detail: {
            request,
            newData,
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
    removeNotebookListener({ operation: "QUERY" });
    removeNotebookListener({ operation: "QUERY_RESPONSE" });
    window.roamAlphaAPI.ui.commandPalette.removeCommand({
      label: "Copy Cross Notebook Reference",
    });
    observer?.disconnect();
  };
};

export default load;
