import createApiMessageHandler from "samepage/backend/createApiMessageHandler";
import decodeState from "../src/utils/decodeState";
import notebookRequestHandler from "src/utils/notebookRequestHandler";
import apiQuery from "./_utils/apiQuery";

// TODO - how do we override the type set by roamjs-components?
// declare global {
//   interface Window {
//     roamAlphaAPI: {
//       data: {
//         fast: {
//           q: (query: string, ...params: unknown[]) => Promise<unknown[][]>;
//         };
//       };
//     };
//   }
// }

// All of our roamjs-components methods use the RoamAlphaAPI, which is not available in the backend.
// We need to mock it so that we could use the same utility functions in the backend.
const mockRoamAlphaAPI = (args: { token: string; graph: string }) => {
  global.window = {
    ...global.window,
    roamAlphaAPI: {
      // @ts-ignore
      data: {
        fast: {
          // @ts-ignore
          q: (query) => {
            if (process.env.NODE_ENV === "development")
              console.log("Backend query", query);
            return apiQuery({ query, ...args });
          },
        },
      },
    },
  };
};

const message = createApiMessageHandler({
  getDecodeState: ({ accessToken, workspace }) => {
    mockRoamAlphaAPI({ token: accessToken, graph: workspace });
    return (id, state) => {
      return decodeState(id, state.$body);
    };
  },
  getNotebookRequestHandler: ({ accessToken, workspace }) => {
    mockRoamAlphaAPI({ token: accessToken, graph: workspace });
    return notebookRequestHandler;
  },
  getNotebookResponseHandler: (token) => async (response) => {
    // TODO
  },
});

export default message;
