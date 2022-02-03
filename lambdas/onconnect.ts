import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  console.log(JSON.stringify(event, null, 4));
  return dynamo
    .putItem({
      TableName: "RoamJSMultiplayer",
      Item: {
        id: { S: event.requestContext?.connectionId || '1' },
        entity: { S: toEntity("client") },
      },
    })
    .promise()
    .then(() => ({ statusCode: 200, body: "Connected" }))
    .catch((e) => ({
      statusCode: 500,
      body: `Failed to connect: ${e.message}`,
    }));
};
