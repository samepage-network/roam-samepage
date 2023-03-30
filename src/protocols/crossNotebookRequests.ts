// THIS FILE IS UNDER HEAVY DEVELOPMENT
// We are working on the new protocol for cross-notebook requests.
import getAllPageNames from "roamjs-components/queries/getAllPageNames";
import type { SamePageAPI } from "samepage/internal/types";

const crossNotebookRequests = (api: SamePageAPI) => {
  const removeListener = api.addNotebookRequestListener(({ request, sendResponse }) => {
    if (Array.isArray(request.conditions)) {
      sendResponse({
        results: getAllPageNames()
          .slice(0, 10)
          .map((id) => ({ id })),
      });
    }
  });
  return removeListener;
};

export default crossNotebookRequests;
