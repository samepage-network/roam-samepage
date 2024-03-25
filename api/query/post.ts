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
import { z } from "zod";

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
  return apiQuery({ token, query, graph }).then(({ result }) => ({
    results: datalogQuery.transformResults(result),
  }));
};

const bodySchema = notebookRequestNodeQuerySchema
  .omit({ schema: true })
  .merge(z.object({ label: z.string().optional() }));

const logic = async ({
  authorization,
  requestId,
  label = "datalog",
  ...body
}: BackendRequest<typeof bodySchema>) => {
  const targetConditions = body.conditions.filter(
    (c) => "relation" in c && c.relation === "is in notebook"
  );
  if (targetConditions.length === 0) {
    return queryRoam({
      authorization,
      body: {
        conditions: body.conditions,
        returnNode: body.returnNode,
        selections: body.selections,
      },
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
    label,
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
  bodySchema,
  allowedOrigins: [/roamresearch\.com/],
});
