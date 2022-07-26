import apiPost from "roamjs-components/util/apiPost";
import { Action } from "../lambdas/common/types";

const isLegacy = process.env.ROAMJS_EXTENSION_ID !== "samepage";

const apiClient = <T extends Record<string, unknown>>({
  data,
  method,
}: {
  data: Record<string, unknown>;
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
          ...data,
        },
      });

export default apiClient;

export const updateSharedPage = ({
  uid,
  log,
}: {
  uid: string;
  log: Action[];
}) =>
  isLegacy
    ? apiPost<{ newIndex: number }>({
        path: "multiplayer",
        data: {
          method: "update-shared-page",
          graph: window.roamAlphaAPI.graph.name,
          uid,
          log,
        },
      })
    : apiPost<{ newIndex: number }>({
        domain: "https://api.samepage.network",
        path: "page",
        data: {
          method: "update-shared-page",
          clientId: 1,
          instance: window.roamAlphaAPI.graph.name,
          clientPageId: uid,
          log,
        },
      });
