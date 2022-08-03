import type { SamePageApi } from "roamjs-components/types/samepage";

export type json =
  | string
  | number
  | boolean
  | null
  | { toJSON: () => string }
  | json[]
  | { [key: string]: json };

export type MessageHandlers = {
  [operation: string]: (data: json, graph: string) => void;
};
export type Status = "DISCONNECTED" | "PENDING" | "CONNECTED";

export type SharedPages = {
  indices: Record<string, number>;
  ids: Set<number>;
  idToUid: Record<string, string>;
};

export type NotificationHandler = (
  args: Record<string, string>,
  api: SamePageApi
) => Promise<void>;
