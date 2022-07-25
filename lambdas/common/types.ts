import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import type { ActionParams } from "roamjs-components/types/native";

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

export type WSEvent = RecursivePartial<APIGatewayProxyEvent>;

export type WSHandler = (event: WSEvent) => Promise<APIGatewayProxyResult>;

export type Action = {
  action: "createBlock" | "updateBlock" | "deleteBlock";
  params: ActionParams;
};
