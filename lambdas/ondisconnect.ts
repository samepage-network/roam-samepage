import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  return dynamo
    .deleteItem({
      TableName: "RoamJSMultiplayer",
      Key: {
        uuid: { S: event.requestContext.connectionId },
        entity: { S: toEntity("client") },
      },
    })
    .promise()
    .then(() => ({ statusCode: 200, body: "Successfully Disconnected" }))
    .catch((e) => ({
      statusCode: 500,
      body: `Failed to disconnect: ${e.message}`,
    }));
};
