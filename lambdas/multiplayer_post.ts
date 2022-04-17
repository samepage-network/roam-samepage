import { APIGatewayProxyHandler } from "aws-lambda";
import getRoamJSUser from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import differenceInMinutes from "date-fns/differenceInMinutes";

const dynamo = new AWS.DynamoDB();

export const handler: APIGatewayProxyHandler = async (event) => {
  const { method, graph } = JSON.parse(event.body || "{}");
  switch (method) {
    case "usage":
      return getRoamJSUser({
        token: event.headers.Authorization || event.headers.authorization || "",
        params: { expand: "period" },
      })
        .then((u) => {
          const { start } = u;
          const startDate = new Date((start as number) * 1000).toJSON();

          const queryAll = (
            entity: string,
            ExclusiveStartKey?: AWS.DynamoDB.Key
          ): Promise<AWS.DynamoDB.ItemList> =>
            dynamo
              .query({
                TableName: "RoamJSMultiplayer",
                IndexName: "entity-date-index",
                ExpressionAttributeNames: {
                  "#s": "entity",
                  "#d": "date",
                },
                ExpressionAttributeValues: {
                  ":s": { S: toEntity(entity) },
                  ":d": { S: startDate },
                },
                KeyConditionExpression: "#s = :s and #d >= :d",
                ExclusiveStartKey,
              })
              .promise()
              .then((r) =>
                r.LastEvaluatedKey
                  ? queryAll(entity, r.LastEvaluatedKey).then((next) =>
                      r.Items.concat(next)
                    )
                  : r.Items
              );

          return Promise.all([
            queryAll("$session").then((items) =>
              items.filter((i) => i.graph.S === graph)
            ),
            queryAll(`${graph}-$message`),
            dynamo
              .query({
                TableName: "RoamJSMultiplayer",
                IndexName: "graph-entity-index",
                ExpressionAttributeNames: {
                  "#s": "entity",
                  "#d": "graph",
                },
                ExpressionAttributeValues: {
                  ":s": { S: toEntity("$network") },
                  ":d": { S: graph },
                },
                KeyConditionExpression: "#s = :s and #d = :d",
              })
              .promise()
              .then((r) => r.Items),
          ]);
        })
        .then(([sessions, messages, networks]) => ({
          statusCode: 200,
          body: JSON.stringify({
            minutes: sessions.reduce(
              (p, c) =>
                differenceInMinutes(
                  new Date(c.date.S),
                  new Date(c.initiated.S)
                ) /
                  5 +
                p,
              0
            ),
            messages: messages.length,
            networks: networks.length,
          }),
          headers,
        }))
        .catch((e) => ({
          statusCode: 500,
          body: e.message,
          headers,
        }));
    default:
      return {
        statusCode: 400,
        body: `Unknown method: ${method}`,
        headers,
      };
  }
};
