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
import randomstring from "randomstring";
import sha from "crypto-js/hmac-sha512";
import Base64 from "crypto-js/enc-base64";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";

const dynamo = new AWS.DynamoDB();

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
      return listNetworks(graph)
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
                ).then((c) => c.flat())
              )
            )
            .then((clients) =>
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
                : dynamo
                    .deleteItem({
                      TableName: "RoamJSMultiplayer",
                      Key: {
                        id: { S: name },
                        entity: { S: toEntity("$network") },
                      },
                    })
                    .promise()
                    .then(() => Promise.resolve())
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
              dynamo
                .getItem({
                  TableName: "RoamJSMultiplayer",
                  Key: {
                    id: { S: event.requestContext.connectionId },
                    entity: { S: toEntity("$client") },
                  },
                })
                .promise()
                .then(() => meterRoamJSUser(user.id, 100))
                .catch(
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
            .promise()
            .then(() =>
              queryByEntity(name).then((items) =>
                Promise.all(
                  items.map((item) => getClientsByGraph(item.graph.S))
                )
              )
            )
            .then((clients) =>
              Promise.all(
                clients
                  .flat()
                  .filter(
                    (id) => id && id !== event.requestContext.connectionId
                  )
                  .map((id) =>
                    postToConnection({
                      ConnectionId: id,
                      Data: {
                        operation: `INITIALIZE_P2P`,
                        to: event.requestContext.connectionId,
                        graph,
                      },
                    })
                  )
              ).then(() => ({
                statusCode: 200,
                body: JSON.stringify({ success: true }),
                headers,
              }))
            );
        })
        .catch(emailCatch("Failed to join Multiplayer network"));
    }
    default:
      return {
        statusCode: 400,
        body: `Unknown method: ${method}`,
        headers,
      };
  }
};
