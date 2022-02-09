import AWS from "aws-sdk";
import toEntity from "./toEntity";

const dynamo = new AWS.DynamoDB();

const getGraphByClient = (event: {
  requestContext?: { connectionId?: string };
}) =>
  dynamo
    .getItem({
      TableName: "RoamJSMultiplayer",
      Key: {
        id: { S: event.requestContext.connectionId },
        entity: { S: toEntity("$client") },
      },
    })
    .promise()
    .then((r) => r.Item.graph?.S || '');

export default getGraphByClient;
