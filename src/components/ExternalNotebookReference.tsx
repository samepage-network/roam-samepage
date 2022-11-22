import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import type { InitialSchema } from "samepage/internal/types";
import apiClient from "samepage/internal/apiClient";
import atJsonToRoam from "../utils/atJsonToRoam";

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
  return <span className="roamjs-connected-ref">{atJsonToRoam(data)}</span>;
};

export const render = (s: HTMLSpanElement) => {
  const text = s.getAttribute("data-paren-str");
  if (text) {
    const [notebookUuid, notebookPageId] = text.split(":");
    if (notebookPageId) {
      s.classList.remove("rm-paren");
      s.classList.remove("rm-paren--closed");
      s.classList.add("rm-block-ref");
      ReactDOM.render(
        <ExternalNotebookReference
          notebookUuid={notebookUuid}
          notebookPageId={notebookPageId}
        />,
        s
      );
    }
  }
};

export default ExternalNotebookReference;
