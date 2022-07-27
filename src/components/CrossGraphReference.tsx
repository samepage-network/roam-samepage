import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import type { InputTextNode } from "roamjs-components/types";
import type { SamePageProps } from "../types";
import { sendToBackend } from "./setupSamePageClient";

const references: Record<string, Record<string, string>> = {};

const CrossGraphReference = ({
  graph,
  uid,
  addGraphListener,
  removeGraphListener,
}: {
  graph: string;
  uid: string;
} & SamePageProps) => {
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
    addGraphListener({
      operation,
      handler: (e) => {
        const { found, node, fromCache } = e as {
          found: boolean;
          node: InputTextNode;
          fromCache?: true;
        };
        if (!fromCache)
          removeGraphListener({
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

export const render = (s: HTMLSpanElement, props: SamePageProps) => {
  const text = s.getAttribute("data-paren-str");
  if (text) {
    const [graph, uid] = text.split(":");
    if (
      uid &&
      props.getNetworkedGraphs().includes(graph) &&
      /[\w\d-]{9}/.test(uid)
    ) {
      s.classList.remove("rm-paren");
      s.classList.remove("rm-paren--closed");
      s.classList.add("rm-block-ref");
      ReactDOM.render(
        <CrossGraphReference graph={graph} uid={uid} {...props} />,
        s
      );
    }
  }
};

export default CrossGraphReference;
