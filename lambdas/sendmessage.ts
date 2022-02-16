import type { WSEvent, WSHandler } from "./common/types";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import postToConnection from "./common/postToConnection";
import queryByEntity from "./common/queryByEntity";
import getGraphByClient from "./common/getGraphByClient";
import postError from "./common/postError";
import queryById from "./common/queryById";
import getRoamJSUser from "roamjs-components/backend/getRoamJSUser";
import axios from "axios";
import removeConnection from "./common/removeConnection";
import getClientByGraph from "./common/getClientByGraph";
import fromEntity from "./common/fromEntity";
import { v4 } from "uuid";

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

// temporary until swapped with subscription
const ensureExtensionInited = async (token: string) => {
  const inited = await axios
    .get(
      `https://lambda.roamjs.com/check?extensionId=multiplayer${
        process.env.NODE_ENV === "development" ? "&dev=true" : ""
      }`,
      { headers: { Authorization: token } }
    )
    .then((r) => r.data.success);
  if (!inited) {
    await axios.post(
      `https://lambda.roamjs.com/user`,
      {},
      {
        headers: {
          Authorization: `Bearer ${Buffer.from(
            `${process.env.ROAMJS_EMAIL}:${process.env.ROAMJS_DEVELOPER_TOKEN}`
          ).toString("base64")}`,
          "x-roamjs-token": token,
          "x-roamjs-extension": "multiplayer",
          ...(process.env.NODE_ENV === "development"
            ? {
                "x-roamjs-dev": "true",
              }
            : {}),
        },
      }
    );
  }
};

export const wsHandler = async (event: WSEvent): Promise<unknown> => {
  const data = event.body ? JSON.parse(event.body).data : {};
  const { operation, ...props } = data;
  console.log("received operation", operation);
  if (operation === "AUTHENTICATION") {
    const { token, graph } = props as { token: string; graph: string };
    // TODO: remove this line
    await ensureExtensionInited(token);

    return getRoamJSUser(token)
      .then(async (user) => {
        // TODO: CHECK USER COULD MULTIPLAYER FROM THIS GRAPH
        // Return user id
        const oldClient = await getClientByGraph(graph);
        if (oldClient) {
          await dynamo
            .deleteItem({
              TableName: "RoamJSMultiplayer",
              Key: {
                id: { S: oldClient },
                entity: { S: toEntity("$client") },
              },
            })
            .promise();
        }
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
              ":u": { S: user.email },
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
        queryById(graph)
          .then((items) => items.map((item) => item.entity.S))
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
              Data: JSON.stringify({
                operation: "AUTHENTICATION",
                success: true,
                messages,
                graphs,
              }),
            }).then(() => graphs)
          )
      )
      .then((graphs) => Promise.all(graphs.map(getClientByGraph)))
      .then((clients) =>
        Promise.all(
          clients
            .filter((c) => !!c)
            .map((ConnectionId) =>
              postToConnection({
                ConnectionId,
                Data: JSON.stringify({
                  operation: "INITIALIZE_P2P",
                  to: event.requestContext.connectionId,
                  graph,
                }),
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
      )
      .catch((e) => {
        console.error(e);
        return postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: JSON.stringify({
            operation: "AUTHENTICATION",
            success: false,
            reason: e.message,
          }),
        }).then(() => removeConnection(event));
      });
  } else if (operation === "LIST_NETWORKS") {
    return getGraphByClient(event)
      .then((graph) => queryById(graph))
      .then((items) =>
        postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: JSON.stringify({
            operation: "LIST_NETWORKS",
            networks: items.map((i) => ({ id: fromEntity(i.entity.S || "") })),
          }),
        })
      );
  } else if (operation === "CREATE_NETWORK") {
    const { name } = props;
    const existingRooms = await queryByEntity(name);
    if (existingRooms.length)
      return postError({
        event,
        Message: `A network already exists by the name of ${name}`,
      });
    return getGraphByClient(event).then((graph) =>
      Promise.all([
        dynamo
          .putItem({
            TableName: "RoamJSMultiplayer",
            Item: {
              id: { S: name },
              entity: { S: toEntity("$network") },
              date: {
                S: new Date().toJSON(),
              },
              graph: { S: graph },
            },
          })
          .promise(),
        dynamo
          .putItem({
            TableName: "RoamJSMultiplayer",
            Item: {
              id: { S: graph }, // TODO: v4() },
              entity: { S: toEntity(name) },
              date: {
                S: new Date().toJSON(),
              },
              graph: { S: graph },
            },
          })
          .promise(),
      ]).then(() =>
        postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: JSON.stringify({
            operation: `CREATE_NETWORK_SUCCESS/${name}`,
          }),
        })
      )
    );
  } else if (operation === "JOIN_NETWORK") {
    const { name } = props;
    return Promise.all([
      getGraphByClient(event),
      dynamo
        .getItem({
          TableName: "RoamJSMultiplayer",
          Key: {
            id: { S: name },
            entity: { S: toEntity("$network") },
          },
        })
        .promise(),
    ]).then(([graph, network]) =>
      network.Item
        ? dynamo
            .putItem({
              TableName: "RoamJSMultiplayer",
              Item: {
                id: { S: graph }, // TODO: v4() },
                entity: { S: toEntity(name) },
                date: {
                  S: new Date().toJSON(),
                },
                graph: { S: graph },
              },
            })
            .promise()
            .then(() =>
              queryByEntity(name).then((items) =>
                Promise.all(items.map((item) => getClientByGraph(item.graph.S)))
              )
            )
            .then((clients) =>
              Promise.all(
                clients
                  .filter((id) => id !== event.requestContext.connectionId)
                  .map((id) =>
                    postToConnection({
                      ConnectionId: id,
                      Data: JSON.stringify({
                        operation: `INITIALIZE_P2P`,
                        to: event.requestContext.connectionId,
                        graph,
                      }),
                    })
                  )
              ).then(() =>
                postToConnection({
                  ConnectionId: event.requestContext.connectionId,
                  Data: JSON.stringify({
                    operation: `JOIN_NETWORK_SUCCESS/${name}`,
                  }),
                })
              )
            )
        : postError({
            event,
            Message: `There does not exist a network called ${name}`,
          })
    );
  } else if (operation === "OFFER") {
    const { to, offer } = props;
    return postToConnection({
      ConnectionId: to,
      Data: JSON.stringify({
        operation: `OFFER`,
        to: event.requestContext.connectionId,
        offer,
      }),
    });
  } else if (operation === "ANSWER") {
    const { to, answer } = props;
    return postToConnection({
      ConnectionId: to,
      Data: JSON.stringify({
        operation: `ANSWER`,
        answer,
      }),
    });
  } else if (operation === "PROXY") {
    // TODO - Storing + Replaying Proxied Messages
    // - We will probably need to handle batch processing for large messages
    const { proxyOperation, graph, ...proxyData } = props;
    return Promise.all([getClientByGraph(graph), getGraphByClient(event)]).then(
      ([ConnectionId, sourceGraph]) => {
        const Data = JSON.stringify({
          operation: proxyOperation,
          graph: sourceGraph,
          ...proxyData,
        });
        if (ConnectionId) {
          return postToConnection({
            ConnectionId,
            Data,
          });
        }
        const messageUuid = v4();
        return dynamo
          .putItem({
            TableName: "RoamJSMultiplayer",
            Item: {
              id: { S: messageUuid },
              entity: { S: toEntity(`${graph}-$message`) },
              date: {
                S: new Date().toJSON(),
              },
              graph: { S: sourceGraph },
            },
          })
          .promise()
          .then(() =>
            s3
              .upload({
                Bucket: "roamjs-data",
                Body: Data,
                Key: `multiplayer/messages/${messageUuid}.json`,
                ContentType: "application/json",
              })
              .promise()
          )
          .then(() => {});
      }
    );
  } else if (operation === "LOAD_MESSAGE") {
    const { messageUuid } = props;
    return Promise.all([
      s3
        .getObject({
          Bucket: "roamjs-data",
          Key: `multiplayer/messages/${messageUuid}.json`,
        })
        .promise(),
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
    ]).then(([r, sourceGraph]) => {
      const Data = r.Body.toString();
      return postToConnection({
        ConnectionId: event.requestContext.connectionId,
        Data: JSON.stringify({
          ...JSON.parse(Data),
          graph: sourceGraph,
        }),
      }).then(() =>
        postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: JSON.stringify({
            operation: `LOAD_MESSAGE/${messageUuid}`,
            graph: sourceGraph,
          }),
        })
      );
    });
  } else {
    return postError({
      event,
      Message: `Invalid server operation: ${operation}`,
    });
  }
};

export const handler: WSHandler = (event) =>
  wsHandler(event)
    .then(() => ({ statusCode: 200, body: "Connected" }))
    .catch((e) =>
      postError({
        event,
        Message: `Uncaught Server Error: ${e.message}`,
      }).then(() => {
        console.log(e);
        return {
          statusCode: 500,
          body: `Failed to connect: ${e.message}`,
        };
      })
    );
