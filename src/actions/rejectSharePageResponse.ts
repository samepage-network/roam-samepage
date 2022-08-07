import { sendToGraph } from "../components/setupSamePageClient";
import type { NotificationHandler } from "../types";

const rejectSharePageResponse: NotificationHandler = async (
  { graph }
) => {
  sendToGraph({
    graph,
    operation: `SHARE_PAGE_RESPONSE`,
    data: {
      success: false,
    },
  });
};

export default rejectSharePageResponse;
