import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import {
  references,
  render as referenceRender,
} from "../components/CrossGraphReference";
import type { SamePageApi } from "roamjs-components/types/samepage";
import apiClient from "../apiClient";
import { InputTextNode } from "roamjs-components/types/native";

let observer: MutationObserver;

const load = (props: SamePageApi) => {
  const { addGraphListener } = props;
  addGraphListener({
    operation: "QUERY",
    handler: (e, graph) => {
      const { request } = e as { request: string };
      const [, uid] = request.split(":");
      const node = getFullTreeByParentUid(uid);
      apiClient({
        method: "query-response",
        data: {
          response: {
            found: !!node.uid,
            node,
          },
          target: {
            instance: graph,
            app: 1,
          },
        },
      });
    },
  });
  addGraphListener({
    operation: "QUERY_RESPONSE",
    handler: (e, graph) => {
      const { found, node } = e as { found: boolean; node: InputTextNode };
      const newText = found ? node.text : `Reference not found`;
      if (!references[graph]) references[graph] = {};
      references[graph][node.uid] = newText;
      // setText(newText); dispatch event to ongoing refs
    },
  });
  observer = createHTMLObserver({
    callback: (s) => referenceRender(s, props),
    tag: "SPAN",
    className: "rm-paren--closed",
  });
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Copy Cross Graph Block Reference",
    callback: () => {
      const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()["block-uid"];
      window.navigator.clipboard.writeText(
        `((${window.roamAlphaAPI.graph.name}:${blockUid}))`
      );
    },
  });
};

export const unload = ({ removeGraphListener }: SamePageApi) => {
  removeGraphListener({ operation: "QUERY" });
  removeGraphListener({ operation: "QUERY_RESPONSE" });
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Copy Cross Graph Block Reference",
  });
  observer?.disconnect();
};

export default load;
