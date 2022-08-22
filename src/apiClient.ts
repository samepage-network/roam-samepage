



import apiPost from "roamjs-components/util/apiPost";

const apiClient = <T extends Record<string, unknown>>({
  data = {},
  method,
}: {
  data?: Record<string, unknown>;
  method: string;
}) =>
  apiPost<T>({
    path: "page",
    data: {
      method,
      app: 1, // Roam
      workspace: window.roamAlphaAPI.graph.name,
      notebookPageId: data.uid,
      pageUuid: data.id,
      ...data,
    },
  });

export default apiClient;
