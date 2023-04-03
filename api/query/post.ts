import { PullBlock } from "roamjs-components/types/native";
import createAPIGatewayProxyHandler from "samepage/backend/createAPIGatewayProxyHandler";
import getAccessToken from "samepage/backend/getAccessToken";
import getDatalogQuery, { DatalogArgs, datalogArgsSchema } from "../../src/utils/getDatalogQuery";

const queryRoam = ({
  token,
  graph,
  query,
}: {
  token: string;
  graph: string;
  query: string;
}) => {
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
  }).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json() as Promise<{ result: PullBlock[][] }>;
  });
};

const logic = async ({
  authorization,
  ...body
}: DatalogArgs & { authorization: string }) => {
  const { accessToken, workspace } = await getAccessToken(authorization);
  const query = getDatalogQuery(body);
  return queryRoam({
    query,
    graph: workspace,
    token: accessToken,
  }).then(({ result }) => ({ results: result.map(([r]) => r), query }));
};

export default createAPIGatewayProxyHandler({
  logic,
  bodySchema: datalogArgsSchema,
  allowedOrigins: [/roamresearch\.com/],
});
