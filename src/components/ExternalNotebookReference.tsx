import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { Classes, Dialog } from "@blueprintjs/core";
import type { InitialSchema } from "samepage/internal/types";
import apiClient from "samepage/internal/apiClient";
import atJsonToRoam from "../utils/atJsonToRoam";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getBlockUidFromTarget from "roamjs-components/dom/getBlockUidFromTarget";

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
        className="roamjs-connected-ref cursor-pointer"
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

export const render = (s: HTMLButtonElement) => {
  const index = Array.from(
    s.parentElement.querySelectorAll(
      "button.rm-xparser-default-samepage-reference"
    )
  ).indexOf(s);
  const blockText = getTextByBlockUid(getBlockUidFromTarget(s));
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
