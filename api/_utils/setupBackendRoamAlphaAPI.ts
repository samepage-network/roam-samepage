// All of our roamjs-components methods use the RoamAlphaAPI, which is not available in the backend.

import apiQuery from "./apiQuery";

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

// We need to mock it so that we could use the same utility functions in the backend.
const backendRoamAlphaAPI = (args: { token: string; graph: string }) => {
  global.window = {
    ...global.window,
    roamAlphaAPI: {
      // @ts-ignore
      data: {
        fast: {
          // @ts-ignore
          q: (query) => {
            if (process.env.NODE_ENV === "development")
              // console.log("Backend query", query);
              return apiQuery({ query, ...args }).then((r) => r.result);
          },
        },
      },
    },
  };
};

export default backendRoamAlphaAPI;
