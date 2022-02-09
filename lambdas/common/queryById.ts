import AWS from "aws-sdk";

const dynamo = new AWS.DynamoDB();

const queryById = (id: string) =>
  dynamo
    .query({
      TableName: "RoamJSMultiplayer",
      ExpressionAttributeNames: {
        "#s": "id",
      },
      ExpressionAttributeValues: {
        ":s": { S: id },
      },
      KeyConditionExpression: "#s = :s",
    })
    .promise()
    .then((r) => r.Items);

export default queryById;
