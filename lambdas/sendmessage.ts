import type { WSEvent, WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import postToConnection from "./common/postToConnection";
import queryByEntity from "./common/queryByEntity";

const dynamo = new AWS.DynamoDB();

export const wsHandler = (event: WSEvent): Promise<unknown> => {
  const data = event.body ? JSON.parse(event.body).data : {};
  const { room, code, operation } = data;
  if (operation === "HOST") {
    return Promise.all([
      dynamo
        .putItem({
          TableName: "RoamJSMultiplayer",
          Item: {
            id: { S: room },
            entity: { S: toEntity("room") },
            data: {
              S: code,
            },
          },
        })
        .promise(),
      dynamo
        .putItem({
          TableName: "RoamJSMultiplayer",
          Item: {
            id: { S: event.requestContext.connectionId },
            entity: { S: toEntity(room) },
            data: {
              S: new Date().toJSON(),
            },
          },
        })
        .promise(),
    ]);
  } else if (operation === "LIST_ROOMS") {
    return queryByEntity("room").then((items) =>
      postToConnection({
        ConnectionId: event.requestContext.connectionId,
        Data: JSON.stringify({
          operation: "LIST_ROOMS",
          rooms: items.map((i) => ({ id: i.id.S, code: i.data.S })),
        }),
      })
    );
  } else if (operation === "JOIN") {
    return queryByEntity(room).then((items) =>
      Promise.all([
        ...items.map((item) =>
          postToConnection({
            ConnectionId: item.id.S,
            Data: JSON.stringify({
              operation: "JOIN",
              code,
            }),
          })
        ),
        dynamo.putItem({
          TableName: "RoamJSMultiplayer",
          Item: {
            id: { S: event.requestContext.connectionId },
            entity: { S: toEntity(room) },
            data: {
              S: new Date().toJSON(),
            },
          },
        }),
      ])
    );
  } else {
    return postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: JSON.stringify({
        operation: "ERROR",
        message: `Invalid server operation: ${operation}`,
      }),
    });
  }
};

export const handler: WSHandler = (event) =>
  wsHandler(event)
    .then(() => ({ statusCode: 200, body: "Connected" }))
    .catch((e) => ({
      statusCode: 500,
      body: `Failed to connect: ${e.message}`,
    }));
