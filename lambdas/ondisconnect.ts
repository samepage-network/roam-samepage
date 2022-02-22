import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";
import emailError from "roamjs-components/backend/emailError";
import differenceInHours from "date-fns/differenceInHours";

const dynamo = new AWS.DynamoDB();

export const handler: WSHandler = (event) => {
  const params = {
    TableName: "RoamJSMultiplayer",
    Key: {
      id: { S: event.requestContext.connectionId },
      entity: { S: toEntity("$client") },
    },
  };
  return dynamo
    .getItem(params)
    .promise()
    .then((r) =>
      r.Item
        ? Promise.all([
            dynamo.deleteItem(params).promise(),
            r.Item.userId
              ? meterRoamJSUser(
                  r.Item.userId.S,
                  differenceInHours(new Date(), new Date(r.Item.date.S))
                )
              : Promise.resolve(),
            // consider saving a $session dynamo object
          ])
        : Promise.reject(
            new Error(
              `Couldn't find ${toEntity("$client")} with id ${
                event.requestContext.connectionId
              }`
            )
          )
    )
    .then(() => ({ statusCode: 200, body: "Successfully Disconnected" }))
    .catch((e) =>
      emailError("Multiplayer OnDisconnect Failure", e).then((id) => {
        return {
          statusCode: 500,
          body: `Failed to disconnect: ${id}`,
        };
      })
    );
};
