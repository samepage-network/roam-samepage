import AWS from "aws-sdk";
import emailCatch from "roamjs-components/backend/emailCatch";
import { endClient } from "../ondisconnect";
import getClientsByGraph from "./getClientsByGraph";
import postToConnection, { removeLocalSocket } from "./postToConnection";
import toEntity from "./toEntity";
import { WSEvent } from "./types";

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

export const messageGraphBase = ({
  targetGraph,
  sourceGraph,
  data,
  messageUuid,
}: {
  targetGraph: string;
  sourceGraph: string;
  data: Record<string, unknown>;
  messageUuid: string;
}) =>
  getClientsByGraph(targetGraph).then((ConnectionIds) => {
    const Data = {
      ...data,
      graph: targetGraph,
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
  });

export default messageGraphBase;
