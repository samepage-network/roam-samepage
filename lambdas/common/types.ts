import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

export type WSHandler = (
  event: RecursivePartial<APIGatewayProxyEvent>
) => Promise<APIGatewayProxyResult>;
