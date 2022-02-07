import AWS from "aws-sdk";
import toEntity from "./toEntity";

const dynamo = new AWS.DynamoDB();

const queryByEntity = (entityType: string) =>
  dynamo
    .query({
      TableName: "RoamJSMultiplayer",
      IndexName: "entity-index",
      ExpressionAttributeNames: {
        "#s": "entity",
      },
      ExpressionAttributeValues: {
        ":s": { S: toEntity(entityType) },
      },
      KeyConditionExpression: "#s = :s",
    })
    .promise()
    .then((r) => r.Items);

export default queryByEntity;
