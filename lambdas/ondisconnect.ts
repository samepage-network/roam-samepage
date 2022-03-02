import type { WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";
import emailError from "roamjs-components/backend/emailError";
import differenceInMinutes from "date-fns/differenceInMinutes";

const dynamo = new AWS.DynamoDB();

export const endClient = (id: string, source: string) => {
  const params = {
    TableName: "RoamJSMultiplayer",
    Key: {
      id: { S: id },
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
            r.Item.user?.S
              ? dynamo
                  .putItem({
                    TableName: params.TableName,
                    Item: {
                      ...r.Item,
                      date: { S: new Date().toJSON() },
                      entity: { S: toEntity("$session") },
                      initiated: { S: r.Item.date.S },
                    },
                  })
                  .promise()
                  .then(() =>
                    meterRoamJSUser(
                      r.Item.user.S,
                      differenceInMinutes(new Date(), new Date(r.Item.date.S))
                    )
                  )
              : Promise.resolve(),
          ])
        : Promise.reject(
            new Error(`Couldn't find ${toEntity("$client")} with id ${id} from ${source}`)
          )
    );
};

export const handler: WSHandler = (event) => {
  return endClient(event.requestContext.connectionId, 'OnDisconnect')
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
