import { APIGatewayProxyHandler } from "aws-lambda";
import getRoamJSUser from "roamjs-components/backend/getRoamJSUser";
import headers from "roamjs-components/backend/headers";
import AWS from "aws-sdk";
import toEntity from "./common/toEntity";
import differenceInMinutes from "date-fns/differenceInMinutes";
import format from "date-fns/format";
import listNetworks from "./common/listNetworks";
import emailCatch from "roamjs-components/backend/emailCatch";
import getClientsByGraph from "./common/getClientsByGraph";
import queryByEntity from "./common/queryByEntity";
import postToConnection from "./common/postToConnection";
import nanoid from "nanoid";
import { HmacSHA512, enc } from "crypto-js";
import { v4 } from "uuid";
import messageGraph from "./common/messageGraph";
import fromEntity from "./common/fromEntity";
import { Action } from "./common/types";

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

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

const getSharedPage = ({ graph, uid }: { graph: string; uid: string }) =>
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
    .then((r) => r.Items?.[0]);

export const handler: APIGatewayProxyHandler = async (event) => {
  const { method, graph, ...rest } = JSON.parse(event.body || "{}");
  const token =
    event.headers.Authorization || event.headers.authorization || "";
  switch (method) {
    case "usage":
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      const endDate = new Date(
        currentMonth === 11 ? currentYear + 1 : currentYear,
        currentMonth === 11 ? 0 : currentMonth + 1,
        1
      );
      const startDate = new Date(currentYear, currentMonth, 1).toJSON();

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
      ])
        .then(([sessions, messages, networks]) => ({
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
        }))
        .catch(emailCatch("Failed to retrieve usage"));
    case "list-networks":
      return getRoamJSUser({ token })
        .then(() => listNetworks(graph))
        .then((networks) => ({
          statusCode: 200,
          body: JSON.stringify({ networks }),
          headers,
        }))
        .catch(emailCatch("Failed to list networks"));
    case "leave-network":
      const { name } = rest as { name: string };
      return Promise.all([
        getUsersByGraph(graph),
        getRoamJSUser({
          token,
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
                id: { S: graph }, // TODO: nanoid() },
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
        .catch(emailCatch("Failed to leave network"));
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
      const salt = nanoid();
      return Promise.all([
        getUsersByGraph(graph),
        getRoamJSUser({
          token,
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
                    S: enc.Base64.stringify(
                      HmacSHA512(
                        password + salt,
                        process.env.PASSWORD_SECRET_KEY
                      )
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
                  id: { S: graph }, // TODO: nanoid() },
                  entity: { S: toEntity(name) },
                  date: {
                    S: new Date().toJSON(),
                  },
                  graph: { S: graph },
                },
              })
              .promise(),
          ]).then(() => ({
            statusCode: 200,
            body: JSON.stringify({ success: true }),
            headers,
          }));
        })
        .catch(emailCatch("Failed to create network"));
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
                id: { S: graph }, // TODO: nanoid() },
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
          const inputPasswordHash = enc.Base64.stringify(
            HmacSHA512(
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
                id: { S: graph }, // TODO: nanoid() },
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
      return getRoamJSUser({ token })
        .then(() => getSharedPage({ graph, uid }))
        .then((item) =>
          item
            ? Promise.resolve({ id: item.id.S || "", created: false })
            : Promise.resolve(nanoid()).then((id) =>
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
                  .then(() =>
                    s3
                      .putObject({
                        Bucket: "roamjs-data",
                        Key: `multiplayer/shared/${id}.json`,
                        Body: JSON.stringify({ log: [], state: {} }),
                        Metadata: { index: "0" },
                      })
                      .promise()
                  )
                  .then(() => ({ created: true, id }))
              )
        )
        .then((body) => ({
          statusCode: 200,
          body: JSON.stringify(body),
          headers,
        }))
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
            .catch((e) =>
              (e as AWS.AWSError).name === "NoSuchKey"
                ? {
                    statusCode: 409,
                    headers,
                    body: `No shared page exists under id ${id}`,
                  }
                : Promise.reject(e)
            )
        )
        .then((r) =>
          "statusCode" in r
            ? r
            : Promise.resolve({
                TableName: "RoamJSMultiplayer",
                Item: {
                  id: { S: id },
                  entity: { S: toEntity(`$shared:${graph}:${uid}`) },
                  date: {
                    S: new Date().toJSON(),
                  },
                  graph: { S: graph },
                },
              }).then((args) =>
                dynamo
                  .putItem(args)
                  .promise()
                  .then(() => ({
                    statusCode: 200,
                    body: r.Body.toString(),
                    headers,
                  }))
                  .catch((e) =>
                    Promise.reject(
                      new Error(
                        `Failed to put item: ${JSON.stringify(
                          args,
                          null,
                          4
                        )}\nReason: ${e.message}`
                      )
                    )
                  )
              )
        )
        .catch(emailCatch("Failed to join a shared page"));
    }
    case "update-shared-page": {
      const { log, uid } = rest as {
        log: Action[];
        uid: string;
      };
      if (!log.length) {
        return getSharedPage({ graph, uid })
          .then((item) =>
            item
              ? s3
                  .headObject({
                    Bucket: "roamjs-data",
                    Key: `multiplayer/shared/${item.id?.S}.json`,
                  })
                  .promise()
                  .then((r) => ({
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                      newIndex: Number(r.Metadata.index),
                    }),
                  }))
              : {
                  statusCode: 400,
                  headers,
                  body: `No shared page available with uid ${uid}`,
                }
          )
          .catch(emailCatch("Failed to update a shared page with empty log"));
      }
      return getRoamJSUser({ token })
        .then(() => {
          return getSharedPage({ graph, uid }).then((item) => {
            if (!item) {
              return {
                statusCode: 400,
                body: `No shared page available with uid ${uid}`,
                headers,
              };
            }
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
              .then((newIndex) => {
                return dynamo
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
                  .then((r) => {
                    return Promise.all(
                      r.Items.filter((item) => {
                        return item.graph.S !== graph;
                      }).map((item) =>
                        messageGraph({
                          sourceGraph: graph,
                          targetGraph: item.graph.S,
                          messageUuid: v4(),
                          data: {
                            log,
                            uid,
                            index: newIndex,
                            operation: "SHARE_PAGE_UPDATE",
                          },
                        })
                      )
                    );
                  })
                  .then(() => {
                    return newIndex;
                  });
              })
              .then((newIndex) => ({
                statusCode: 200,
                body: JSON.stringify({ newIndex }),
                headers,
              }));
          });
        })
        .catch(emailCatch("Failed to update a shared page"));
    }
    case "get-shared-page": {
      const { localIndex, uid } = rest as { localIndex: number; uid: string };
      return getSharedPage({ graph, uid })
        .then((item) => {
          if (!item) {
            return {
              statusCode: 200,
              body: JSON.stringify({ exists: false, log: [] }),
              headers,
            };
          }
          if (typeof localIndex === "undefined") {
            return {
              statusCode: 200,
              body: JSON.stringify({ exists: true, log: [] }),
              headers,
            };
          }
          const id = item.id.S;
          return s3
            .headObject({
              Bucket: "roamjs-data",
              Key: `multiplayer/shared/${id}.json`,
            })
            .promise()
            .then((r) => {
              const remoteIndex = Number(r.Metadata.index);
              if (remoteIndex <= localIndex) {
                return {
                  statusCode: 200,
                  body: JSON.stringify({ log: [], exists: true }),
                  headers,
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
              body: JSON.stringify({
                log: (r.log || []).slice(localIndex),
                exists: true,
              }),
              headers,
            }));
        })
        .catch(emailCatch("Failed to get a shared page"));
    }
    case "list-shared-pages": {
      return getRoamJSUser({ token })
        .then(() =>
          dynamo
            .query({
              TableName: "RoamJSMultiplayer",
              IndexName: "graph-entity-index",
              ExpressionAttributeNames: {
                "#s": "entity",
                "#d": "graph",
              },
              ExpressionAttributeValues: {
                ":s": { S: `$shared:${graph}` },
                ":d": { S: graph },
              },
              KeyConditionExpression: "begins_with(#s, :s) and #d = :d",
            })
            .promise()
        )
        .then((r) =>
          Promise.all(
            r.Items.filter((i) =>
              process.env.NODE_ENV === "development"
                ? i.entity.S.endsWith("-dev")
                : !i.entity.S.endsWith("-dev")
            ).map((i) =>
              s3
                .headObject({
                  Bucket: "roamjs-data",
                  Key: `multiplayer/shared/${i.id.S}.json`,
                })
                .promise()
                .then((o) => [
                  fromEntity(i.entity.S).split(":")?.[2],
                  Number(o.Metadata.index),
                ])
            )
          )
        )
        .then((entries) => ({
          statusCode: 200,
          body: JSON.stringify({ indices: Object.fromEntries(entries) }),
          headers,
        }))
        .catch(emailCatch("Failed to retrieve shared pages"));
    }
    case "disconnect-shared-page": {
      const { uid } = rest as {
        uid: string;
      };
      return getRoamJSUser({ token })
        .then(() => getSharedPage({ graph, uid }))
        .then((item) =>
          !item
            ? { statusCode: 400, body: `Page ${uid} is not connected`, headers }
            : dynamo
                .deleteItem({
                  TableName: "RoamJSMultiplayer",
                  Key: {
                    id: { S: item.id.S },
                    entity: { S: toEntity(`$shared:${graph}:${uid}`) },
                  },
                })
                .promise()
                .then(() => ({
                  statusCode: 200,
                  body: JSON.stringify({}),
                  headers,
                }))
        )
        .catch(emailCatch("Failed to disconnect a shared page"));
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
