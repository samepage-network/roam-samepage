import type setupSamePageClient from "@samepage/client/protocols/setupSamePageClient";

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
  args: Record<string, string>
) => Promise<void>;

export type SamePageApi = Pick<
  Awaited<ReturnType<typeof setupSamePageClient>>,
  "addNotebookListener" | "removeNotebookListener" | "sendToNotebook"
>;
