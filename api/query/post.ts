import { PullBlock } from "roamjs-components/types/native";
import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";
import getAccessToken from "samepage/backend/getAccessToken";
import getDatalogQuery, {
  SamePageQueryArgs,
} from "../../src/utils/getDatalogQuery";
import backendCrossNotebookRequest from "../../src/utils/backendCrossNotebookRequest";
import compileDatalog from "src/utils/compileDatalog";
import {
  BackendRequest,
  notebookRequestNodeQuerySchema,
} from "samepage/internal/types";
import apiQuery from "api/_utils/apiQuery";
import setupBackendRoamAlphaAPI from "api/_utils/setupBackendRoamAlphaAPI";

const queryRoam = async ({
  authorization,
  body,
}: {
  authorization: string;
  body: SamePageQueryArgs;
}) => {
  const { accessToken: token, workspace: graph } = await getAccessToken({
    authorization,
  });
  setupBackendRoamAlphaAPI({ token, graph });
  const datalogQuery = await getDatalogQuery(body);
  const query = compileDatalog(datalogQuery);
  try {
    return apiQuery({ token, query, graph }).then(({ result }) => ({
      results: datalogQuery.transformResults(result),
    }));
  } catch (error) {
    if (error.status === 404) {
      throw error;
    }
    // handle other errors as we currently do
  }
};

const logic = async ({
  authorization,
  requestId,
  ...body
}: BackendRequest<typeof notebookRequestNodeQuerySchema>) => {
  const targetConditions = body.conditions.filter(
    (c) => "relation" in c && c.relation === "is in notebook"
  );
  if (targetConditions.length === 0) {
    return queryRoam({
      authorization,
      body,
    });
  }
  // TODO - support multiple targets
  return backendCrossNotebookRequest<{ result: PullBlock[][] }>({
    authorization,
    request: {
      ...body,
      conditions: body.conditions.filter(
        (c) => !("relation" in c) || c.relation !== "is in notebook"
      ),
      schema: "node-query",
    },
    label: "datalog", // TODO - use alias
    target: "target" in targetConditions[0] ? targetConditions[0].target : "",
  }).then((response) =>
    typeof response === "string" || response === null
      ? { results: [] }
      : {
          results:
            "results" in response && Array.isArray(response.results)
              ? response.results
              : [],
        }
  );
};

export default createAPIGatewayProxyHandler({
  logic,
  bodySchema: notebookRequestNodeQuerySchema.omit({ schema: true }),
  allowedOrigins: [/roamresearch\.com/],
});