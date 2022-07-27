import apiPost from "roamjs-components/util/apiPost";

const isLegacy = process.env.ROAMJS_EXTENSION_ID !== "samepage";

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
        domain: "https://api.samepage.network",
        path: "page",
        data: {
          method,
          clientId: 1, // Roam
          instance: window.roamAlphaAPI.graph.name,
          clientPageId: data.uid,
          pageUuid: data.id,
          networkName: data.name,
          ...data,
        },
      });

export default apiClient;
