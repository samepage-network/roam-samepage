// THIS FILE IS UNDER HEAVY DEVELOPMENT
// We are working on the new protocol for cross-notebook requests.
import {
  JSONData,
  NotebookRequestHandler,
  notebookRequestNodeQuerySchema,
} from "samepage/internal/types";
import getDatalogQuery from "./getDatalogQuery";
import encodeState from "./encodeState";
import compileDatalog from "./compileDatalog";

const notebookRequestHandler: NotebookRequestHandler = async ({ request }) => {
  if (request.schema === "node-query") {
    const result = notebookRequestNodeQuerySchema.safeParse(request);
    if (!result.success) return;
    const datalogQuery = await getDatalogQuery(result.data);
    const query = compileDatalog(datalogQuery);
    const results = await (window.roamAlphaAPI.data.fast.q(
      query
    ) as JSONData[][]);
    return {
      results: datalogQuery.transformResults(results),
    };
  } else if (typeof request.notebookPageId === "string") {
    const pageData = await encodeState(request.notebookPageId);
    return pageData;
  }
  return {};
};

export default notebookRequestHandler;
