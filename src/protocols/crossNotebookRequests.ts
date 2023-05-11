import type { SamePageAPI } from "samepage/internal/types";
import notebookRequestHandler from "src/utils/notebookRequestHandler";

const crossNotebookRequests = (api: SamePageAPI) => {
  return api.addNotebookRequestListener(notebookRequestHandler);
};

export default crossNotebookRequests;
