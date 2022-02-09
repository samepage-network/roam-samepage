import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  return dynamo
    .deleteItem({
      TableName: "RoamJSMultiplayer",
      Key: {
        id: { S: event.requestContext.connectionId },
        entity: { S: toEntity("$client") },
      },
    })
    .promise()
    .then(() => ({ statusCode: 200, body: "Successfully Disconnected" }))
    .catch((e) => {
      console.error("Error in ondisconnect handler");
      console.error(e);
      return {
        statusCode: 500,
        body: `Failed to disconnect: ${e.message}`,
      };
    });
};
