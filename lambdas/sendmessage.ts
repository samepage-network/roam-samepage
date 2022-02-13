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

const dynamo = new AWS.DynamoDB();

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
    const { token, graph } = props;
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
          .promise();
      })
      .then(() =>
        postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: JSON.stringify({ operation: "AUTHENTICATION", success: true }),
        })
      )
      .then(() => {
        queryById(graph)
          .then((items) => items.map((item) => item.entity.S))
          .then((networks) =>
            Promise.all(
              networks.map((network) =>
                queryByEntity(fromEntity(network)).then((items) =>
                  items.map((item) => item.id.S)
                )
              )
            )
          )
          .then((graphs) => {
            const graphSet = new Set(graphs.flat());
            graphSet.delete(graph);
            return Promise.all(Array.from(graphSet).map(getClientByGraph));
          })
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
          );
      })
      .catch((e) =>
        postToConnection({
          ConnectionId: event.requestContext.connectionId,
          Data: JSON.stringify({
            operation: "AUTHENTICATION",
            success: false,
            reason: e.message,
          }),
        }).then(() => removeConnection(event))
      );
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
            },
          })
          .promise(),
        dynamo
          .putItem({
            TableName: "RoamJSMultiplayer",
            Item: {
              id: { S: graph },
              entity: { S: toEntity(name) },
              date: {
                S: new Date().toJSON(),
              },
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
                id: { S: graph },
                entity: { S: toEntity(name) },
                date: {
                  S: new Date().toJSON(),
                },
              },
            })
            .promise()
            .then(() =>
              queryByEntity(name).then((items) =>
                Promise.all(items.map((item) => getClientByGraph(item.id.S)))
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
    // - Try posting to connection
    // - Else - Store in dynamo as $message with timestamp
    // - If user doesnt have a metadata replay value, set one to now
    // - Expose a way within authenticate to grab all previous messages and return
    // - We will probably need to handle batch processing for large messages
    const { proxyOperation, graph, ...proxyData } = props;
    return postToConnection({
      ConnectionId: await getGraphByClient(graph), // get client by graph
      Data: JSON.stringify({
        operation: proxyOperation,
        ...proxyData,
      }),
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
