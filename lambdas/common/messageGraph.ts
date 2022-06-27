import AWS from "aws-sdk";
import meterRoamJSUser from "roamjs-components/backend/meterRoamJSUser";
import emailCatch from "roamjs-components/backend/emailCatch";
import { endClient } from "../ondisconnect";
import getClientsByGraph from "./getClientsByGraph";
import postToConnection, { removeLocalSocket } from "./postToConnection";
import toEntity from "./toEntity";
import { WSEvent } from "./types";

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

export const messageGraphBase = ({
  userId,
  targetGraph,
  sourceGraph,
  data,
  messageUuid,
}: {
  targetGraph: string;
  sourceGraph: string;
  data: Record<string, unknown>;
  messageUuid: string;
  userId: string;
}) =>
  getClientsByGraph(targetGraph)
    .then((ConnectionIds) => {
      const Data = {
        ...data,
        graph: sourceGraph,
      };
      return (
        ConnectionIds.length
          ? Promise.all(
              ConnectionIds.map((ConnectionId) =>
                postToConnection({
                  ConnectionId,
                  Data,
                })
                  .then(() => true)
                  .catch((e) => {
                    if (process.env.NODE_ENV === "production") {
                      return endClient(
                        ConnectionId,
                        `Missed Message (${e.message})`
                      )
                        .then(() => false)
                        .catch(() => false);
                    } else {
                      removeLocalSocket(ConnectionId);
                      return false;
                    }
                  })
              )
            ).then((all) => all.every((i) => i))
          : Promise.resolve(false)
      ).then(
        (online) =>
          !online &&
          dynamo
            .putItem({
              TableName: "RoamJSMultiplayer",
              Item: {
                id: { S: messageUuid },
                entity: { S: toEntity(`${targetGraph}-$message`) },
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
                  Body: JSON.stringify(Data),
                  Key: `multiplayer/messages/${messageUuid}.json`,
                  ContentType: "application/json",
                })
                .promise()
            )
            .then(() => Promise.resolve())
      );
    })
    .then(() =>
      meterRoamJSUser(userId).catch(
        emailCatch(
          `Failed to meter Multiplayer user for message ${messageUuid}`
        )
      )
    );

const messageGraph = ({
  event,
  ...rest
}: {
  targetGraph: string;
  sourceGraph: string;
  data: Record<string, unknown>;
  messageUuid: string;
  event: WSEvent;
}) =>
  dynamo
    .getItem({
      TableName: "RoamJSMultiplayer",
      Key: {
        id: { S: event.requestContext.connectionId },
        entity: { S: toEntity("$client") },
      },
    })
    .promise()
    .then((r) =>
      r.Item
        ? r.Item.user
          ? messageGraphBase({ userId: r.Item?.user?.S, ...rest })
          : Promise.reject(
              new Error(
                `How did non-authenticated client try to send message from ${rest.sourceGraph} to ${rest.targetGraph}?`
              )
            )
        : Promise.reject(
            new Error(
              `How did a non-existant client ${event.requestContext.connectionId} send message from ${rest.sourceGraph} to ${rest.targetGraph}?`
            )
          )
    );

export default messageGraph;
