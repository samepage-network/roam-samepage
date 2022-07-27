import type { SamePageApi } from "roamjs-components/types/samepage";

export type SharedPages = {
  indices: Record<string, number>;
  ids: Set<number>;
  idToUid: Record<string, string>;
};

export type NotificationHandler = (
  args: Record<string, string>,
  api: SamePageProps
) => Promise<void>;

export type SamePageProps = Pick<
  SamePageApi,
  | "addGraphListener"
  | "sendToGraph"
  | "getNetworkedGraphs"
  | "removeGraphListener"
>;
