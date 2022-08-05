import apiPost from "roamjs-components/util/apiPost";

export const isLegacy = process.env.ROAMJS_EXTENSION_ID !== "samepage";

const apiClient = <T extends Record<string, unknown>>({
  data = {},
  method,
}: {
  data?: Record<string, unknown>;
  method: string;
}) =>
  isLegacy
    ? apiPost<T>({
        path: "multiplayer",
        data: {
          method,
          graph: window.roamAlphaAPI.graph.name,
          ...data,
        },
      })
    : apiPost<T>({
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
