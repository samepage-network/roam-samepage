// THIS FILE IS UNDER HEAVY DEVELOPMENT
// We are working on the new protocol for cross-notebook requests.
import type { json, SamePageAPI } from "samepage/internal/types";
import getDatalogQuery, {
  samePageQueryArgsSchema,
} from "../utils/getDatalogQuery";
import calculateState from "../utils/calculateState";
import compileDatalog from "../utils/compileDatalog";

const crossNotebookRequests = (api: SamePageAPI) => {
  const removeListener = api.addNotebookRequestListener(
    async ({ request, sendResponse }) => {
      if (Array.isArray(request.conditions)) {
        const result = samePageQueryArgsSchema.safeParse(request);
        if (!result.success) return;
        const datalogQuery = getDatalogQuery(result.data);
        const query = compileDatalog(datalogQuery);
        const results = (
          window.roamAlphaAPI.data.fast.q(query) as [json][]
        ).map((r) => r[0]);
        sendResponse({
          results,
        });
      } else if (typeof request.notebookPageId === "string") {
        const pageData = await calculateState(request.notebookPageId);
        sendResponse(pageData);
      }
    }
  );
  return removeListener;
};

export default crossNotebookRequests;
