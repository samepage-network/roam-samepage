import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
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
