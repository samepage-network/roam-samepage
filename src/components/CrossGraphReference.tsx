import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import type { InputTextNode } from "roamjs-components/types";
import apiClient from "../apiClient";
import type { SamePageApi } from "roamjs-components/types/samepage";

export const references: Record<string, Record<string, string>> = {};

const CrossGraphReference = ({
  graph,
  uid,
}: {
  graph: string;
  uid: string;
} & SamePageApi) => {
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
    apiClient<{
      found: boolean;
      node: InputTextNode;
      fromCache?: true;
    }>({
      method: "query",
      data: {
        // TODO: replace with a datalog query
        // [:find
        //    (pull ?b [:content])
        //  :where
        //    [?b :uid "${uid}"]
        //    [?b :notebook "${graph}"]
        //    [?b :app "Roam"]
        // ]
        request: `${graph}:${uid}`,
      },
    }).then((e) => {
      const { found, node } = e;
      const newText = found ? node.text : `Reference not found`;
      if (!references[graph]) references[graph] = {};
      references[graph][uid] = newText;
      setText(newText);
    });
  }, []);
  return <span className="roamjs-connected-ref">{text}</span>;
};

export const render = (s: HTMLSpanElement, props: SamePageApi) => {
  const text = s.getAttribute("data-paren-str");
  if (text) {
    const [graph, uid] = text.split(":");
    if (uid && /[\w\d-]{9}/.test(uid)) {
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
