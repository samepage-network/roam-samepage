import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";
import emailError from "roamjs-components/backend/emailError";
import differenceInMinutes from "date-fns/differenceInMinutes";

const dynamo = new AWS.DynamoDB();

export const saveSession = ({
  item,
  source,
}: {
  item: AWS.DynamoDB.AttributeMap;
  source: string;
}) => {
  const now = new Date();
  return Promise.all([
    dynamo
      .deleteItem({
        TableName: "RoamJSMultiplayer",
        Key: {
          id: { S: item.id.S },
          entity: { S: toEntity("$client") },
        },
      })
      .promise(),
    item.user?.S
      ? dynamo
          .putItem({
            TableName: "RoamJSMultiplayer",
            Item: {
              ...item,
              date: { S: now.toJSON() },
              entity: { S: toEntity("$session") },
              initiated: { S: item.date.S },
              disconnectedBy: { S: source },
            },
          })
          .promise()
          .then(() => {
            const quantity = Math.ceil(
              differenceInMinutes(now, new Date(item.date.S)) / 5 
              // not charging if it's less than 5 minutes, timeouts are usually 10.
            );
            if (quantity > 0) {
              return meterRoamJSUser(
                item.user.S,
                differenceInMinutes(new Date(), new Date(item.date.S))
              );
            }
          })
      : Promise.resolve(),
  ]);
};

export const endClient = (id: string, source: string) => {
  return dynamo
    .getItem({
      TableName: "RoamJSMultiplayer",
      Key: {
        id: { S: id },
        entity: { S: toEntity("$client") },
      },
    })
    .promise()
    .then((r) => {
      if (r.Item) {
        return saveSession({ item: r.Item, source });
      }
    });
};

export const handler: WSHandler = (event) => {
  return endClient(event.requestContext.connectionId, "OnDisconnect")
    .then(() => ({ statusCode: 200, body: "Successfully Disconnected" }))
    .catch((e) =>
      emailError(
        `Multiplayer OnDisconnect Failure: ${event.requestContext.connectionId}`,
        e
      ).then((id) => {
        return {
          statusCode: 500,
          body: `Failed to disconnect: ${id}`,
        };
      })
    );
};
