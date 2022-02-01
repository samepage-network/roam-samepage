import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import { v4 } from "uuid";
import toEntity from "./common/toEntity";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  return dynamo
    .putItem({
      TableName: "RoamJSMultiplayer",
      Item: {
        id: { S: v4() },
        entity: { S: toEntity("message") },
        data: { S: event.body || "" },
      },
    })
    .promise()
    .then(() => ({ statusCode: 200, body: "Connected" }))
    .catch((e) => ({
      statusCode: 500,
      body: `Failed to connect: ${e.message}`,
    }));
};
