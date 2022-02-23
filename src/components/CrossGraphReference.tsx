import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import type { InputTextNode } from "roamjs-components/types";
import { sendToBackend } from "./setupMultiplayer";

const references: Record<string, Record<string, string>> = {};

const CrossGraphReference = ({
  graph,
  uid,
}: {
  graph: string;
  uid: string;
}) => {
  /* the dream
    window.roamAlphaAPI.ui.components.renderBlockText({
        text: node.text,
        el,
    });
    */
  const [text, setText] = useState(
    references[graph]?.[uid] || `Loading reference from ${graph}`
  );
  useEffect(() => {
    const operation = `QUERY_REF_RESPONSE/${graph}/${uid}`;
    window.roamjs.extension.multiplayer.addGraphListener({
      operation,
      handler: (e) => {
        const { found, node, fromCache } = e as {
          found: boolean;
          node: InputTextNode;
          fromCache?: true;
        };
        if (!fromCache)
          window.roamjs.extension.multiplayer.removeGraphListener({
            operation,
          });
        const newText = found ? node.text : `Reference not found`;
        if (!references[graph]) references[graph] = {};
        references[graph][uid] = newText;
        setText(newText);
      },
    });
    sendToBackend({
      operation: "QUERY_REF",
      data: { uid, graph },
    });
  }, []);
  return <span className="roamjs-connected-ref">{text}</span>;
};

export const render = (s: HTMLSpanElement, getGraphs: () => string[]) => {
  const text = s.getAttribute("data-paren-str");
  if (text) {
    const [graph, uid] = text.split(":");
    if (uid && getGraphs().includes(graph) && /[\w\d-]{9}/.test(uid)) {
      s.classList.remove("rm-paren");
      s.classList.remove("rm-paren--closed");
      s.classList.add("rm-block-ref");
      ReactDOM.render(<CrossGraphReference graph={graph} uid={uid} />, s);
    }
  }
};

export default CrossGraphReference;
