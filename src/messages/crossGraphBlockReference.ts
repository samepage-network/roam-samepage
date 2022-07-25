import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import {
  MessageLoaderProps,
  sendToBackend,
} from "../components/setupSamePageClient";
import { render as referenceRender } from "../components/CrossGraphReference";

let observer: MutationObserver;

const load = ({ addGraphListener, getNetworkedGraphs }: MessageLoaderProps) => {
  addGraphListener({
    operation: "QUERY_REF",
    handler: (e, graph) => {
      const { uid } = e as { uid: string };
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
    callback: (s) => referenceRender(s, getNetworkedGraphs),
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

export const unload = ({ removeGraphListener }: MessageLoaderProps) => {
  removeGraphListener({ operation: "QUERY_REF" });
  window.roamAlphaAPI.ui.commandPalette.removeCommand({
    label: "Copy Cross Graph Block Reference",
  });
  observer.disconnect();
};

export default load;
