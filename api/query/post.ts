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
  const datalogQuery = getDatalogQuery(body);
  const query = compileDatalog(datalogQuery);
  return apiQuery({ token, query, graph }).then(({ result }) => ({
    results: result.map((a) =>
      Object.fromEntries(a.flatMap((e) => Object.entries(e)))
    ),
  }));
};

const logic = async ({
  authorization,
  requestId,
  ...body
}: BackendRequest<typeof notebookRequestNodeQuerySchema>) => {
  const targetConditions = body.conditions.filter(
    (c) => c.relation === "is in notebook"
  );
  if (targetConditions.length === 0) {
    return queryRoam({
      authorization,
      body,
    });
  }
  // To handle multiple targets, split the request body and send a request for each target
  return backendCrossNotebookRequest<{ result: PullBlock[][] }>({
    authorization,
    request: {
      ...body,
      conditions: body.conditions.filter(
        (c) => c.relation !== "is in notebook"
      ),
      schema: "node-query",
    },
    label: "datalog", // TODO - use alias
    target: targetConditions[0]?.target || "",
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
