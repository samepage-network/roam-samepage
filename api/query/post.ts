import { PullBlock } from "roamjs-components/types/native";
import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";
import getAccessToken from "samepage/backend/getAccessToken";
import getDatalogQuery, {
  SamePageQueryArgs,
  samePageQueryArgsSchema,
} from "../../src/utils/getDatalogQuery";
import backendCrossNotebookRequest from "../../src/utils/backendCrossNotebookRequest";
import compileDatalog from "src/utils/compileDatalog";
import { BackendRequest } from "samepage/internal/types";

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
  const Authorization = `Bearer ${token.replace(/^Bearer /, "")}`;
  return fetch(`https://api.roamresearch.com/api/graph/${graph}/q`, {
    body: JSON.stringify({ query }),
    headers: {
      Authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "follow",
  })
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText);
      return res.json() as Promise<{ result: PullBlock[][] }>;
    })
    .then(({ result }) => ({ results: result.map(([r]) => r) }));
};

const logic = async ({
  authorization,
  requestId,
  ...body
}: BackendRequest<typeof samePageQueryArgsSchema>) => {
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
    },
    label: "datalog", // TODO - use alias
    target: targetConditions[0]?.target || "",
  }).then((response) =>
    typeof response === "string"
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
  // @ts-ignore
  bodySchema: samePageQueryArgsSchema,
  allowedOrigins: [/roamresearch\.com/],
});
