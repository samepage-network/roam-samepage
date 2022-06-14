import type { WSEvent, WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import postToConnection from "./common/postToConnection";
import queryByEntity from "./common/queryByEntity";
import getGraphByClient from "./common/getGraphByClient";
import postError from "./common/postError";
import getRoamJSUser from "roamjs-components/backend/getRoamJSUser";
import removeConnection from "./common/removeConnection";
import getClientsByGraph from "./common/getClientsByGraph";
import fromEntity from "./common/fromEntity";
import type { InputTextNode } from "roamjs-components/types";
import messageGraph from "./common/messageGraph";
import listNetworks from "./common/listNetworks";

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

const dataHandler = async (
  event: WSEvent,
  data: string,
  messageUuid: string
): Promise<unknown> => {
  const { operation, ...props } = JSON.parse(data);
  console.log(
    "received operation",
    operation,
    "from client",
    event.requestContext.connectionId
  );
  if (operation === "AUTHENTICATION") {
    const { token, graph } = props as { token: string; graph: string };
    return getRoamJSUser({ token })
      .then(async (user) => {
        return dynamo
          .updateItem({
            TableName: "RoamJSMultiplayer",
            Key: {
              id: { S: event.requestContext.connectionId },
              entity: { S: toEntity("$client") },
            },
            UpdateExpression: "SET #s = :s, #u = :u",
            ExpressionAttributeNames: {
              "#s": "graph",
              "#u": "user",
            },
            ExpressionAttributeValues: {
              ":s": { S: graph },
              ":u": { S: user.id },
            },
          })
          .promise()
          .then(() => {
            return dynamo
              .query({
                TableName: "RoamJSMultiplayer",
                IndexName: "entity-date-index",
                ExpressionAttributeNames: {
                  "#s": "entity",
                },
                ExpressionAttributeValues: {
                  ":s": { S: toEntity(`${graph}-$message`) },
                },
                KeyConditionExpression: "#s = :s",
              })
              .promise()
              .then((r) => r.Items.map((i) => i.id.S));
          });
      })
      .then((messages) =>
        // TODO - get memberships by some other method
        listNetworks(graph)
          .then((networks) => {
            return Promise.all(
              networks.map((network) =>
                queryByEntity(fromEntity(network)).then((items) =>
                  items.map((item) => item.graph.S)
                )
              )
            ).then((graphs) => {
              const graphSet = new Set(graphs.flat());
              graphSet.delete(graph);
              return Array.from(graphSet);
            });
          })
          .then((graphs) =>
            postToConnection({
              ConnectionId: event.requestContext.connectionId,
              Data: {
                operation: "AUTHENTICATION",
                success: true,
                messages,
                graphs,
              },
            })
              .then(() => graphs)
              .catch((e) => {
                console.error(e);
                return postToConnection({
                  ConnectionId: event.requestContext.connectionId,
                  Data: {
                    operation: "AUTHENTICATION",
                    success: false,
                    reason: e.message,
                  },
                })
                  .then(() => removeConnection(event))
                  .then(() => []);
              })
          )
      )
      .then((graphs) => Promise.all(graphs.map(getClientsByGraph)))
      .then((clients) =>
        Promise.all(
          clients
            .flat()
            .filter((c) => !!c)
            .map((ConnectionId) =>
              postToConnection({
                ConnectionId,
                Data: {
                  operation: "INITIALIZE_P2P",
                  to: event.requestContext.connectionId,
                  graph,
                },
              }).catch((e) => {
                console.warn(e);
                return dynamo
                  .deleteItem({
                    TableName: "RoamJSMultiplayer",
                    Key: {
                      id: { S: ConnectionId },
                      entity: { S: toEntity("$client") },
                    },
                  })
                  .promise();
              })
            )
        )
      );
  } else if (operation === "OFFER") {
    const { to, offer } = props as { to: string; offer: string };
    return postToConnection({
      ConnectionId: to,
      Data: {
        operation: `OFFER`,
        to: event.requestContext.connectionId,
        offer,
      },
    });
  } else if (operation === "ANSWER") {
    const { to, answer } = props as { to: string; answer: string };
    return postToConnection({
      ConnectionId: to,
      Data: {
        operation: `ANSWER`,
        answer,
      },
    });
  } else if (operation === "PROXY") {
    // TODO - Storing + Replaying Proxied Messages
    // - We will probably need to handle batch processing for large messages
    const { proxyOperation, graph, ...proxyData } = props as {
      proxyOperation: string;
      graph: string;
    };
    return getGraphByClient(event).then((sourceGraph) =>
      messageGraph({
        event,
        graph,
        sourceGraph,
        data: {
          operation: proxyOperation,
          ...proxyData,
        },
        messageUuid,
      })
    );
  } else if (operation === "LOAD_MESSAGE") {
    const { messageUuid } = props as { messageUuid: string };
    return Promise.all([
      s3
        .getObject({
          Bucket: "roamjs-data",
          Key: `multiplayer/messages/${messageUuid}.json`,
        })
        .promise()
        .then((r) => r.Body.toString())
        .catch(() => {
          console.error(`Could not load message ${messageUuid}`);
          return JSON.stringify("{}");
        }),
      getGraphByClient(event).then((graph) =>
        dynamo
          .getItem({
            TableName: "RoamJSMultiplayer",
            Key: {
              id: { S: messageUuid },
              entity: { S: toEntity(`${graph}-$message`) },
            },
          })
          .promise()
          .then((r) =>
            dynamo
              .putItem({
                TableName: "RoamJSMultiplayer",
                Item: {
                  ...r.Item,
                  entity: { S: toEntity(`${graph}-$synced`) },
                },
              })
              .promise()
              .then(() => r.Item?.graph?.S)
          )
          .then((sourceGraph) =>
            dynamo
              .deleteItem({
                TableName: "RoamJSMultiplayer",
                Key: {
                  id: { S: messageUuid },
                  entity: { S: toEntity(`${graph}-$message`) },
                },
              })
              .promise()
              .then(() => sourceGraph)
          )
      ),
    ]).then(([Data, sourceGraph]) => {
      return postToConnection({
        ConnectionId: event.requestContext.connectionId,
        Data: {
          ...JSON.parse(Data),
          graph: sourceGraph,
        },
      }).then(() =>
        postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: {
            operation: `LOAD_MESSAGE/${messageUuid}`,
            graph: sourceGraph,
          },
        })
      );
    });
  } else if (operation === "QUERY_REF") {
    const { graph, uid } = props as { graph: string; uid: string };
    const dynamoId = `${graph}:${uid}`;
    return dynamo
      .getItem({
        TableName: "RoamJSMultiplayer",
        Key: {
          id: { S: dynamoId },
          entity: { S: toEntity("$reference") },
        },
      })
      .promise()
      .then((r) => {
        if (r.Item)
          return s3
            .getObject({
              Bucket: "roamjs-data",
              Key: `multiplayer/references/${graph}/${uid}.json`,
            })
            .promise()
            .then((r) =>
              postToConnection({
                ConnectionId: event.requestContext.connectionId,
                Data: {
                  operation: `QUERY_REF_RESPONSE/${graph}/${uid}`,
                  node: JSON.parse(r.Body.toString()),
                  found: true,
                  fromCache: true,
                  ephemeral: true,
                },
              })
            )
            .catch();
      })
      .then(() => getGraphByClient(event))
      .then((sourceGraph) =>
        messageGraph({
          event,
          sourceGraph,
          graph,
          data: {
            uid,
            operation: "QUERY_REF",
          },
          messageUuid,
        })
      );
  } else if (operation === "QUERY_REF_RESPONSE") {
    const { found, node, graph } = props as {
      found: boolean;
      graph: string;
      node: InputTextNode;
    };
    if (found) {
      await s3
        .upload({
          Bucket: "roamjs-data",
          Body: JSON.stringify(node),
          Key: `multiplayer/references/${graph}/${node.uid}.json`,
          ContentType: "application/json",
        })
        .promise()
        .then(() =>
          dynamo
            .putItem({
              TableName: "RoamJSMultiplayer",
              Item: {
                id: { S: `${graph}:${node.uid}` },
                entity: { S: toEntity(`$reference`) },
                date: {
                  S: new Date().toJSON(),
                },
                graph: { S: graph },
              },
            })
            .promise()
        );
    }
    return getGraphByClient(event).then((sourceGraph) =>
      messageGraph({
        event,
        graph,
        sourceGraph,
        data: {
          operation: `QUERY_REF_RESPONSE/${sourceGraph}/${node.uid}`,
          node,
          found,
          ephemeral: true,
        },
        messageUuid,
      })
    );
  } else {
    return postError({
      event,
      Message: `Invalid server operation: ${operation}`,
    });
  }
};

export const wsHandler = async (event: WSEvent): Promise<unknown> => {
  const chunkData = event.body ? JSON.parse(event.body).data : {};
  const { message, uuid, chunk, total } = chunkData;
  if (total === 1) return dataHandler(event, message, uuid);
  else
    return s3
      .upload({
        Bucket: "roamjs-data",
        Body: message,
        Key: `multiplayer/ongoing/${uuid}/chunk${chunk}`,
        ContentType: "application/json",
      })
      .promise()
      .then(() =>
        dynamo
          .updateItem({
            TableName: "RoamJSMultiplayer",
            Key: {
              id: { S: uuid },
              entity: { S: toEntity("$ongoing") },
            },
            UpdateExpression: "ADD #c :c",
            ExpressionAttributeNames: {
              "#c": "chunks",
            },
            ExpressionAttributeValues: {
              ":c": { NS: [chunk.toString()] },
            },
            ReturnValues: "UPDATED_NEW",
          })
          .promise()
      )
      .then((item) => {
        if (item.Attributes.chunks.NS.length === total) {
          return Promise.all(
            Array(total)
              .fill(null)
              .map((_, c) =>
                c === chunk
                  ? { message, chunk }
                  : s3
                      .getObject({
                        Bucket: "roamjs-data",
                        Key: `multiplayer/ongoing/${uuid}/chunk${c}`,
                      })
                      .promise()
                      .then((r) => ({ message: r.Body.toString(), chunk: c }))
                      .catch((e) => {
                        return Promise.reject(
                          new Error(
                            `Failed to fetch chunk ${c} for ongoing message ${uuid}: ${e.message}`
                          )
                        );
                      })
              )
          ).then((chunks) =>
            dataHandler(
              event,
              chunks
                .sort((a, b) => a.chunk - b.chunk)
                .map((a) => a.message)
                .join(""),
              uuid
            )
          );
        }
      });
};

export const handler: WSHandler = (event) =>
  wsHandler(event)
    // THIS IS CRAZY
    // If `postToConnection` is the final call of `dataHandler`
    // the message doesn't actually get sent unless there's another
    // request that comes after it! I need to do some more testing around this
    // but for now, this is good enough for launch. Fingers crossed 🤞
    .then(() => getGraphByClient(event))
    // END of THIS IS CRAZY
    .then(() => ({ statusCode: 200, body: "Success" }))
    .catch((e) =>
      postError({
        event,
        Message: `Uncaught Server Error: ${e.message}`,
      })
        // THIS IS CRAZY
        // If `postToConnection` is the final call of `dataHandler`
        // the message doesn't actually get sent unless there's another
        // request that comes after it! I need to do some more testing around this
        // but for now, this is good enough for launch. Fingers crossed 🤞
        .then(() => getGraphByClient(event))
        // END of THIS IS CRAZY
        .then(() => {
          console.log(e);
          return {
            statusCode: 500,
            body: `Uncaught Server Error: ${e.message}`,
          };
        })
    );
