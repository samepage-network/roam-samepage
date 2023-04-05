import { PullBlock } from "roamjs-components/types/native";
import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";
import getAccessToken from "samepage/backend/getAccessToken";
import apiClient from "samepage/internal/apiClient";
import getDatalogQuery, {
  DatalogArgs,
  datalogArgsSchema,
} from "../../src/utils/getDatalogQuery";
import backendCrossNotebookRequest from "../../src/utils/backendCrossNotebookRequest";

const queryRoam = async ({
  authorization,
  body,
}: {
  authorization: string;
  body: DatalogArgs;
}) => {
  const { accessToken: token, workspace: graph } = await getAccessToken(
    authorization
  );
  const query = getDatalogQuery(body);
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
}: DatalogArgs & { authorization: string; requestId: string }) => {
  const targetConditions = body.conditions.filter(
    (c) => c.relation === "is in notebook"
  );
  if (targetConditions.length === 0) {
    return queryRoam({
      authorization,
      body,
    });
  }
  return backendCrossNotebookRequest<{ result: PullBlock[][] }>({
    authorization,
    request: {
      ...body,
      conditions: body.conditions.filter(
        (c) => c.relation !== "is in notebook"
      ),
    },
    label: "datalog", // TODO - use alias
    targets: targetConditions.map((c) => c.target),
  }).then((response) => ({
    results: Object.values(response).flatMap((r) =>
      !r || typeof r === "string" ? [] : r.result
    ),
  }));
};

export default createAPIGatewayProxyHandler({
  logic,
  bodySchema: datalogArgsSchema,
  allowedOrigins: [/roamresearch\.com/],
});
