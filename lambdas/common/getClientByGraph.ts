import AWS from "aws-sdk";
import toEntity from "./toEntity";

const dynamo = new AWS.DynamoDB();

const getClientByGraph = (graph: string) =>
  dynamo
    .query({
      TableName: "RoamJSMultiplayer",
      IndexName: "graph-entity-index",
      ExpressionAttributeNames: {
        "#g": "graph",
        "#s": "entity",
      },
      ExpressionAttributeValues: {
        ":g": { S: graph },
        ":s": { S: toEntity("$client") },
      },
      KeyConditionExpression: "#s = :s AND #g = :g",
    })
    .promise()
    .then((r) => r.Items[0]?.id?.S);

export default getClientByGraph;
