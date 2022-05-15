import { APIGatewayProxyHandler } from "aws-lambda";
import getRoamJSUser from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import AWS, { S3 } from "aws-sdk";
import toEntity from "./common/toEntity";
import differenceInMinutes from "date-fns/differenceInMinutes";
import format from "date-fns/format";
import listNetworks from "./common/listNetworks";
import emailCatch from "roamjs-components/backend/emailCatch";
import getClientsByGraph from "./common/getClientsByGraph";
import queryByEntity from "./common/queryByEntity";
import postToConnection from "./common/postToConnection";
import randomstring from "randomstring";
import sha from "crypto-js/hmac-sha512";
import Base64 from "crypto-js/enc-base64";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";
import type { ActionParams } from "roamjs-components/types";
import { v4 } from "uuid";
import { messageGraphBase } from "./common/messageGraph";
import fromEntity from "./common/fromEntity";

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

export type Action = {
  action: "createBlock" | "updateBlock" | "deleteBlock";
  params: ActionParams;
};

const getUsersByGraph = (graph: string) =>
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
    .then((r) => r.Items.map((i) => i.user?.S));

export const handler: APIGatewayProxyHandler = async (event) => {
  const { method, graph, ...rest } = JSON.parse(event.body || "{}");
  const token =
    event.headers.Authorization || event.headers.authorization || "";
  switch (method) {
    case "usage":
      return getRoamJSUser({
        token,
        params: { expand: "period" },
      })
        .then((u) => {
          const { start, end } = u;
          const endDate = new Date((end as number) * 1000);
          const startDate = new Date((start as number) * 1000).toJSON();

          const queryAll = (
            entity: string,
            ExclusiveStartKey?: AWS.DynamoDB.Key
          ): Promise<AWS.DynamoDB.ItemList> =>
            dynamo
              .query({
                TableName: "RoamJSMultiplayer",
                IndexName: "entity-date-index",
                ExpressionAttributeNames: {
                  "#s": "entity",
                  "#d": "date",
                },
                ExpressionAttributeValues: {
                  ":s": { S: toEntity(entity) },
                  ":d": { S: startDate },
                },
                KeyConditionExpression: "#s = :s and #d >= :d",
                ExclusiveStartKey,
              })
              .promise()
              .then((r) =>
                r.LastEvaluatedKey
                  ? queryAll(entity, r.LastEvaluatedKey).then((next) =>
                      r.Items.concat(next)
                    )
                  : r.Items
              );

          return Promise.all([
            queryAll("$session").then((items) =>
              items.filter((i) => i.graph.S === graph)
            ),
            queryAll(`${graph}-$message`),
            dynamo
              .query({
                TableName: "RoamJSMultiplayer",
                IndexName: "graph-entity-index",
                ExpressionAttributeNames: {
                  "#s": "entity",
                  "#d": "graph",
                },
                ExpressionAttributeValues: {
                  ":s": { S: toEntity("$network") },
                  ":d": { S: graph },
                },
                KeyConditionExpression: "#s = :s and #d = :d",
              })
              .promise()
              .then((r) => r.Items),
          ]).then(([sessions, messages, networks]) => ({
            statusCode: 200,
            body: JSON.stringify({
              minutes: sessions.reduce(
                (p, c) =>
                  differenceInMinutes(
                    new Date(c.date.S),
                    new Date(c.initiated.S)
                  ) /
                    5 +
                  p,
                0
              ),
              messages: messages.length,
              networks: networks.length,
              date: format(endDate, "MMMM do, yyyy"),
            }),
            headers,
          }));
        })
        .catch(emailCatch("Failed to retrieve Multiplayer usage"));
    case "list-networks":
      return getRoamJSUser({ token })
        .then(() => listNetworks(graph))
        .then((networks) => ({
          statusCode: 200,
          body: JSON.stringify({ networks }),
          headers,
        }))
        .catch(emailCatch("Failed to list Multiplayer networks"));
    case "leave-network":
      const { name } = rest as { name: string };
      return Promise.all([
        getUsersByGraph(graph),
        getRoamJSUser({
          token,
          params: { expand: "period" },
        }),
      ])
        .then(([users, user]) => {
          if (users.some((u) => u !== user.id)) {
            return {
              statusCode: 401,
              body: "No authenticated client connected to this graph",
              headers,
            };
          }
          return dynamo
            .deleteItem({
              TableName: "RoamJSMultiplayer",
              Key: {
                id: { S: graph }, // TODO: v4() },
                entity: { S: toEntity(name) },
              },
            })
            .promise()
            .then(() =>
              queryByEntity(name).then((items) =>
                Promise.all(
                  items.map((item) => getClientsByGraph(item.graph.S))
                ).then((c) => ({ items, clients: c.flat() }))
              )
            )
            .then(({ clients, items }) =>
              clients.length
                ? Promise.all(
                    clients
                      .filter((id) => !!id)
                      .map((id) =>
                        postToConnection({
                          ConnectionId: id,
                          Data: {
                            operation: `LEAVE_NETWORK`,
                            graph,
                          },
                        })
                      )
                  ).then(() => Promise.resolve())
                : !items.length
                ? dynamo
                    .deleteItem({
                      TableName: "RoamJSMultiplayer",
                      Key: {
                        id: { S: name },
                        entity: { S: toEntity("$network") },
                      },
                    })
                    .promise()
                    .then(() => Promise.resolve())
                : Promise.resolve()
            )
            .then(() => ({
              statusCode: 200,
              body: JSON.stringify({ success: true }),
              headers,
            }));
        })
        .catch(emailCatch("Failed to leave Multiplayer network"));
    case "create-network": {
      const { name, password } = rest as { name: string; password: string };
      if (!password) {
        return {
          statusCode: 400,
          body: `Must include a password of length greater than zero`,
          headers,
        };
      }
      const existingRooms = await queryByEntity(name);
      if (existingRooms.length)
        return {
          statusCode: 400,
          body: `A network already exists by the name of ${name}`,
          headers,
        };
      const salt = randomstring.generate(16);
      return Promise.all([
        getUsersByGraph(graph),
        getRoamJSUser({
          token,
          params: { expand: "period" },
        }),
      ])
        .then(([users, user]) => {
          if (users.some((u) => u !== user.id)) {
            return {
              statusCode: 401,
              body: "No authenticated client connected to this graph",
              headers,
            };
          }
          return Promise.all([
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
                  password: {
                    S: Base64.stringify(
                      sha(password + salt, process.env.PASSWORD_SECRET_KEY)
                    ),
                  },
                  salt: { S: salt },
                  user: { S: user.id },
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
          ])
            .then(() =>
              meterRoamJSUser(user.id, 100).catch(
                emailCatch(
                  `Failed to meter Multiplayer user for network ${name}`
                )
              )
            )
            .then(() => ({
              statusCode: 200,
              body: JSON.stringify({ success: true }),
              headers,
            }));
        })
        .catch(emailCatch("Failed to create Multiplayer network"));
    }
    case "join-network": {
      const { name, password } = rest as { name: string; password: string };
      if (!password) {
        return {
          statusCode: 400,
          body: `Must include a password of length greater than zero`,
          headers,
        };
      }
      return Promise.all([
        getUsersByGraph(graph),
        getRoamJSUser({
          token,
          params: { expand: "period" },
        }),
        dynamo
          .getItem({
            TableName: "RoamJSMultiplayer",
            Key: {
              id: { S: name },
              entity: { S: toEntity("$network") },
            },
          })
          .promise(),
      ])
        .then(async ([users, user, network]) => {
          if (users.some((u) => u !== user.id)) {
            return {
              statusCode: 401,
              body: "No authenticated client connected to this graph",
              headers,
            };
          }
          if (!network.Item)
            return {
              statusCode: 400,
              body: `There does not exist a network called ${name}`,
              headers,
            };
          if (!graph)
            return {
              statusCode: 400,
              body: "Cannot join a network until you've been authenticated",
              headers,
            };
          const existingMembership = await dynamo
            .getItem({
              TableName: "RoamJSMultiplayer",
              Key: {
                id: { S: graph }, // TODO: v4() },
                entity: { S: toEntity(name) },
              },
            })
            .promise();
          if (existingMembership.Item)
            return {
              statusCode: 400,
              body: `This graph is already a part of the network ${name}`,
              headers,
            };
          const passwordHash = network.Item.password.S;
          const inputPasswordHash = Base64.stringify(
            sha(
              password + (network.Item.salt.S || ""),
              process.env.PASSWORD_SECRET_KEY
            )
          );
          if (!passwordHash || inputPasswordHash !== passwordHash)
            return {
              statusCode: 403,
              body: `Incorrect password for network ${name}`,
              headers,
            };
          return dynamo
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
            .then(() => {
              return queryByEntity(name).then((items) => {
                return Promise.all(
                  items.map((item) =>
                    getClientsByGraph(item.graph.S).catch((e) => {
                      console.log("error thrown querying item", item);
                      console.log(e);
                      return [];
                    })
                  )
                );
              });
            })
            .then((clients) => {
              return Promise.all(
                clients
                  .flat()
                  .filter(
                    (id) => id && id !== event.requestContext.connectionId
                  )
                  .map((ConnectionId) =>
                    postToConnection({
                      ConnectionId,
                      Data: {
                        operation: `INITIALIZE_P2P`,
                        to: event.requestContext.connectionId,
                        graph,
                      },
                    })
                  )
              ).then(() => {
                return {
                  statusCode: 200,
                  body: JSON.stringify({ success: true }),
                  headers,
                };
              });
            });
        })
        .catch(emailCatch("Failed to join Multiplayer network"));
    }
    case "init-shared-page": {
      const { uid } = rest as {
        uid: string;
      };
      const id = v4();
      return getRoamJSUser({ token })
        .then(() =>
          dynamo
            .putItem({
              TableName: "RoamJSMultiplayer",
              Item: {
                id: { S: id },
                entity: { S: toEntity(`$shared`) },
                date: {
                  S: new Date().toJSON(),
                },
                graph: { S: graph },
                index: { N: "0" },
              },
            })
            .promise()
        )
        .then(() =>
          dynamo
            .putItem({
              TableName: "RoamJSMultiplayer",
              Item: {
                id: { S: id },
                entity: { S: toEntity(`$shared:${graph}:${uid}`) },
                date: {
                  S: new Date().toJSON(),
                },
                graph: { S: graph },
              },
            })
            .promise()
        )
        .then(() =>
          s3
            .putObject({
              Bucket: "roamjs-data",
              Key: `multiplayer/shared/${id}.json`,
              Body: JSON.stringify({ log: [], state: {} }),
            })
            .promise()
        )
        .then(() => ({ statusCode: 200, body: JSON.stringify({ id }) }))
        .catch(emailCatch("Failed to init a shared page"));
    }
    case "join-shared-page": {
      const { id, uid } = rest as {
        id: string;
        uid: string;
      };
      return getRoamJSUser({ token })
        .then(() =>
          s3
            .getObject({
              Bucket: "roamjs-data",
              Key: `multiplayer/shared/${id}.json`,
            })
            .promise()
        )
        .then((r) =>
          dynamo
            .putItem({
              TableName: "RoamJSMultiplayer",
              Item: {
                id: { S: id },
                entity: { S: toEntity(`$shared:${graph}:${uid}`) },
                date: {
                  S: new Date().toJSON(),
                },
                graph: { S: graph },
              },
            })
            .promise()
            .then(() => ({ statusCode: 200, body: r.Body.toString() }))
        )
        .catch(emailCatch("Failed to join a shared page"));
    }
    case "update-shared-page": {
      const { log, uid } = rest as {
        log: Action[];
        uid: string;
      };
      return getRoamJSUser({ token })
        .then((user) =>
          dynamo
            .query({
              TableName: "RoamJSMultiplayer",
              IndexName: "graph-entity-index",
              ExpressionAttributeNames: {
                "#s": "entity",
                "#d": "graph",
              },
              ExpressionAttributeValues: {
                ":s": { S: toEntity(`$shared:${graph}:${uid}`) },
                ":d": { S: graph },
              },
              KeyConditionExpression: "#s = :s and #d = :d",
            })
            .promise()
            .then((r) => {
              if (!r.Items?.length) {
                return {
                  statusCode: 400,
                  body: `No shared page available with uid ${uid}`,
                  headers,
                };
              }
              const item = r.Items[0];
              const id = item.id.S;

              return s3
                .getObject({
                  Bucket: "roamjs-data",
                  Key: `multiplayer/shared/${id}.json`,
                })
                .promise()
                .then((r) => JSON.parse(r.Body.toString()))
                .then((data) => {
                  const updatedLog = data.log.concat(log) as Action[];
                  const state = data.state;
                  log.forEach(({ action, params }) => {
                    if (action === "createBlock") {
                      const { uid, ...block } = params.block;
                      state[params.location["parent-uid"]] = {
                        ...state[params.location["parent-uid"]],
                        children: (
                          state[params.location["parent-uid"]]?.children || []
                        )?.splice(params.location.order, 0, uid),
                      };
                      state[uid] = block;
                    } else if (action === "updateBlock") {
                      const { uid, ...block } = params.block;
                      state[uid] = {
                        ...block,
                        children: state[uid]?.children || [],
                      };
                    } else if (action === "deleteBlock") {
                      delete state[params.block.uid];
                    }
                  });
                  return s3
                    .putObject({
                      Bucket: "roamjs-data",
                      Key: `multiplayer/shared/${id}.json`,
                      Body: JSON.stringify({ log: updatedLog, state }),
                      Metadata: { index: updatedLog.length.toString() },
                    })
                    .promise()
                    .then(() => updatedLog.length);
                })
                .then((newIndex) =>
                  Promise.all([
                    dynamo
                      .updateItem({
                        TableName: "RoamJSMultiplayer",
                        Key: {
                          id: { S: id },
                          entity: { S: toEntity(`$shared`) },
                        },
                        UpdateExpression: "SET #s = :s",
                        ExpressionAttributeNames: {
                          "#s": "index",
                        },
                        ExpressionAttributeValues: {
                          ":s": { N: `${newIndex}` },
                        },
                      })
                      .promise()
                      .then(() => newIndex),
                    dynamo
                      .query({
                        TableName: "RoamJSMultiplayer",
                        IndexName: "id-index",
                        ExpressionAttributeNames: {
                          "#s": "id",
                        },
                        ExpressionAttributeValues: {
                          ":s": { S: id },
                        },
                        KeyConditionExpression: "#s = :s",
                      })
                      .promise()
                      .then((r) =>
                        Promise.all(
                          r.Items.filter((item) => {
                            const ent = fromEntity(item.entity.S);
                            return ent !== "$shared" && item.graph.S !== graph;
                          }).map((item) =>
                            messageGraphBase({
                              sourceGraph: graph,
                              userId: user.id,
                              graph: item.graph.S,
                              messageUuid: v4(),
                              data: { log, uid, index: newIndex },
                            })
                          )
                        )
                      ),
                  ])
                )
                .then((newIndex) => ({
                  statusCode: 200,
                  body: JSON.stringify({ newIndex }),
                  headers,
                }));
            })
        )
        .catch(emailCatch("Failed to update a shared page"));
    }
    case "get-shared-page": {
      const { localIndex, uid } = rest as { localIndex: number; uid: string };
      return dynamo
        .query({
          TableName: "RoamJSMultiplayer",
          IndexName: "graph-entity-index",
          ExpressionAttributeNames: {
            "#s": "entity",
            "#d": "graph",
          },
          ExpressionAttributeValues: {
            ":s": { S: toEntity(`$shared:${graph}:${uid}`) },
            ":d": { S: graph },
          },
          KeyConditionExpression: "#s = :s and #d = :d",
        })
        .promise()
        .then((r) => {
          if (!r.Items?.length) {
            return {
              statusCode: 400,
              body: `No shared page available with uid ${uid}`,
              headers,
            };
          }
          const item = r.Items[0];
          const id = item.id.S;
          return dynamo
            .getItem({
              TableName: "RoamJSMultiplayer",
              Key: {
                id: { S: id },
              },
            })
            .promise()
            .then((r) => {
              const remoteIndex = Number(r.Item.index.N);
              if (remoteIndex <= localIndex) {
                return {
                  statusCode: 200,
                  body: JSON.stringify({ log: [] }),
                };
              }
              return s3
                .getObject({
                  Bucket: "roamjs-data",
                  Key: `multiplayer/shared/${id}.json`,
                })
                .promise()
                .then((r) => JSON.parse(r.Body.toString()));
            })
            .then((r) => ({
              statusCode: 200,
              body: JSON.stringify({ log: r.log.slice(localIndex) }),
              headers,
            }));
        })
        .catch(emailCatch("Failed to get a shared page"));
    }
    case "list-shared-pages": {
      return {
        statusCode: 200,
        body: JSON.stringify({indices: {}}),
        headers,
      }
    }
    default:
      return {
        statusCode: 400,
        body: `Unknown method: ${method}`,
        headers,
      };
  }
};

if (process.env.NODE_ENV === "development") {
  import("../scripts/ws").then(() => console.log("ws running..."));
}
