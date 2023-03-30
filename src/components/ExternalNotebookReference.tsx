import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { Classes, Dialog } from "@blueprintjs/core";
import type { InitialSchema } from "samepage/internal/types";
import apiClient from "samepage/internal/apiClient";
import atJsonToRoam from "../utils/atJsonToRoam";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getUids from "roamjs-components/dom/getUids";
import getNthChildUidByBlockUid from "roamjs-components/queries/getNthChildUidByBlockUid";
import getReferenceBlockUid from "roamjs-components/dom/getReferenceBlockUid";

export const references: Record<string, Record<string, InitialSchema>> = {};

const ExternalNotebookReference = ({
  notebookUuid,
  notebookPageId,
}: {
  notebookUuid: string;
  notebookPageId: string;
}) => {
  const [data, setData] = useState<InitialSchema>(
    references[notebookUuid]?.[notebookPageId] || {
      content: `Loading reference from external notebook...`,
      annotations: [],
    }
  );
  const setReferenceData = useCallback(
    (data: InitialSchema) => {
      if (!references[notebookUuid]) references[notebookUuid] = {};
      setData((references[notebookUuid][notebookPageId] = data));
    },
    [notebookPageId, notebookUuid]
  );
  useEffect(() => {
    apiClient<{
      found: boolean;
      data: InitialSchema;
    }>({
      method: "query",
      request: `${notebookUuid}:${notebookPageId}`,
    }).then((e) => {
      const { found, data } = e;
      const newData = found
        ? data
        : { content: "Notebook reference not found", annotations: [] };
      setReferenceData(newData);
    });
    const queryResponseListener = (e: CustomEvent) => {
      const { request, data } = e.detail as {
        request: string;
        data: InitialSchema;
      };
      if (request === `${notebookUuid}:${notebookPageId}`) {
        setReferenceData(data);
      }
    };
    document.body.addEventListener(
      "samepage:reference:response",
      queryResponseListener
    );
    return () =>
      document.body.removeEventListener(
        "samepage:reference:response",
        queryResponseListener
      );
  }, [setReferenceData, notebookUuid, notebookPageId]);
  const [showData, setShowData] = useState(false);
  return (
    <>
      <span
        className="roamjs-connected-ref cursor-pointer rm-xparser-default-samepage-reference"
        onClick={() => setShowData(true)}
      >
        [[{notebookPageId}]]
      </span>
      <Dialog
        title={notebookPageId}
        onClose={() => setShowData(false)}
        isOpen={showData}
      >
        <div className={Classes.DIALOG_BODY}>{atJsonToRoam(data)}</div>
      </Dialog>
    </>
  );
};

const referenceRegex =
  /{{samepage-reference:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):((?:[^}]|}(?!}))+)}}/g;

// adapted from roamjs-components/dom/getBlockUidFromTarget
const getBlockFromTarget = (
  target: HTMLElement
): { el: HTMLElement; uid: () => string } => {
  const ref = target.closest(".rm-block-ref") as HTMLSpanElement;
  if (ref) {
    return { el: ref, uid: () => ref.getAttribute("data-uid") || "" };
  }

  const customView = target.closest(".roamjs-block-view") as HTMLDivElement;
  if (customView) {
    return { el: customView, uid: () => getUids(customView).blockUid };
  }

  const aliasTooltip = target.closest(".rm-alias-tooltip__content");
  if (aliasTooltip) {
    const aliasRef = document.querySelector(
      ".bp3-popover-open .rm-alias--block"
    ) as HTMLAnchorElement;
    return {
      el: aliasRef,
      uid: () => getReferenceBlockUid(aliasRef, "rm-alias--block"),
    };
  }

  const el = target.closest(".roam-block") as HTMLDivElement;
  const { blockUid } = getUids(el);
  const kanbanTitle = target.closest(".kanban-title");
  if (kanbanTitle) {
    const container = kanbanTitle.closest<HTMLDivElement>(
      ".kanban-column-container"
    );
    if (container) {
      const column = kanbanTitle.closest(".kanban-column");
      const order = Array.from(container.children).findIndex(
        (d) => d === column
      );
      return {
        el: container,
        uid: () => getNthChildUidByBlockUid({ blockUid, order }),
      };
    }
  }
  if (el) return { el, uid: () => blockUid };
  return { el: target, uid: () => "" };
};

export const render = (s: HTMLButtonElement) => {
  const { el, uid: getUid } = getBlockFromTarget(s);
  const index = Array.from(
    el.querySelectorAll(".rm-xparser-default-samepage-reference")
  ).indexOf(s);
  const blockText = getTextByBlockUid(getUid());
  const match = Array.from(blockText.matchAll(referenceRegex))[index];
  if (match) {
    const [_, notebookUuid, notebookPageId] = match;
    if (notebookPageId) {
      s.parentElement.classList.add("rm-block-ref");
      ReactDOM.render(
        <ExternalNotebookReference
          notebookUuid={notebookUuid}
          notebookPageId={notebookPageId}
        />,
        s.parentElement
      );
    }
  }
};

export default ExternalNotebookReference;
