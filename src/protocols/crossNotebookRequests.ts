// THIS FILE IS UNDER HEAVY DEVELOPMENT
// We are working on the new protocol for cross-notebook requests.
import getAllPageNames from "roamjs-components/queries/getAllPageNames";
import type { SamePageAPI } from "samepage/internal/types";
import calculateState from "../utils/calculateState";

const crossNotebookRequests = (api: SamePageAPI) => {
  const removeListener = api.addNotebookRequestListener(
    async ({ request, sendResponse }) => {
      if (Array.isArray(request.conditions)) {
        sendResponse({
          results: getAllPageNames()
            .slice(0, 10)
            .map((id) => ({ id })),
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
