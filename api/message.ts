import createApiMessageHandler from "samepage/backend/createApiMessageHandler";
import decodeState from "../src/utils/decodeState";
import notebookRequestHandler from "src/utils/notebookRequestHandler";
import backendRoamAlphaAPI from "./_utils/setupBackendRoamAlphaAPI";

const message = createApiMessageHandler({
  getDecodeState: ({ accessToken, workspace }) => {
    backendRoamAlphaAPI({ token: accessToken, graph: workspace });
    return (id, state) => {
      return decodeState(id, state.$body);
    };
  },
  getNotebookRequestHandler: ({ accessToken, workspace }) => {
    backendRoamAlphaAPI({ token: accessToken, graph: workspace });
    return notebookRequestHandler;
  },
});

export default message;
