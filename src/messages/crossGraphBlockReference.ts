import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import { sendToBackend } from "../components/setupSamePageClient";
import { render as referenceRender } from "../components/CrossGraphReference";
import { SamePageProps } from "../types";

let observer: MutationObserver;

const load = (props: SamePageProps) => {
  const { addGraphListener } = props;
  addGraphListener({
    operation: "QUERY_REF",
    handler: (e, graph) => {
      const { request } = e as { request: string };
      const [, uid] = request.split(":");
      const node = getFullTreeByParentUid(uid);
      sendToBackend({
        operation: "QUERY_REF_RESPONSE",
        data: {
          found: !!node.uid,
          node,
          graph,
        },
      });
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

export const unload = ({ removeGraphListener }: SamePageProps) => {
  removeGraphListener({ operation: "QUERY_REF" });
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Copy Cross Graph Block Reference",
  });
  observer.disconnect();
};

export default load;
