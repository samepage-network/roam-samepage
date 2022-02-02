import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import { v4 } from "uuid";
import toEntity from "./common/toEntity";
import postToConnection from "./common/postToConnection";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  const Data = event.body ? JSON.parse(event.body).data : "No Data?!";
  return dynamo
    .putItem({
      TableName: "RoamJSMultiplayer",
      Item: {
        id: { S: v4() },
        entity: { S: toEntity("message") },
        data: {
          S: Data,
        },
      },
    })
    .promise()
    .then(() =>
      dynamo
        .query({
          TableName: "RoamJSMultiplayer",
          IndexName: "entity-index",
          ExpressionAttributeNames: {
            "#s": "status",
          },
          ExpressionAttributeValues: {
            ":s": { S: toEntity("client") },
          },
          KeyConditionExpression: "#s = :s",
        })
        .promise()
        .then((r) =>
          Promise.all(
            r.Items.map((i) => i.id.S).map((id) =>
              postToConnection({ Data, ConnectionId: id })
            )
          )
        )
    )
    .then(() => ({ statusCode: 200, body: "Connected" }))
    .catch((e) => ({
      statusCode: 500,
      body: `Failed to connect: ${e.message}`,
    }));
};
