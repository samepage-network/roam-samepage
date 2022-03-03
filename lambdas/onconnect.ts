import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import emailError from "roamjs-components/backend/emailError";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  return dynamo
    .putItem({
      TableName: "RoamJSMultiplayer",
      Item: {
        id: { S: event.requestContext.connectionId },
        entity: { S: toEntity("$client") },
        date: {
          S: new Date().toJSON(),
        },
      },
    })
    .promise()
    .then(() => ({ statusCode: 200, body: "Connected" }))
    .catch((e) =>
      emailError(`Multiplayer OnConnect Failure: ${event.requestContext.connectionId}`, e).then((id) => {
        return {
          statusCode: 500,
          body: `Failed to connect: ${id}`,
        };
      })
    );
};
