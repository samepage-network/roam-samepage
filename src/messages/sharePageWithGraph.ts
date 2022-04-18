import { render as renderToast } from "roamjs-components/components/Toast";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import type { InputTextNode } from "roamjs-components/types";
import { notify } from "../components/NotificationContainer";
import { MessageLoaderProps } from "../components/setupMultiplayer";
import { render } from "../components/SharePageAlert";

const load = ({ addGraphListener, sendToGraph }: MessageLoaderProps) => {
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Share Page With Graph",
    callback: () => {
      //   render({ pageUid: getCurrentPageUid() });
      renderToast({
        content: "Feature is still in development. Coming Soon!",
        id: "coming-soon",
      });
    },
  });
  addGraphListener({
    operation: "SHARE_PAGE",
    handler: (e, graph) => {
      const { uid, title, tree, isPage } = e as {
        uid: string;
        title: string;
        tree: InputTextNode[];
        isPage: boolean;
      };
      notify({
        title: "Share Page",
        description: `Graph ${graph} is attempting to share page ${title}. Would you like to accept?`,
        actions: [
          { label: "Accept", callback: async () => {} },
          {
            label: "Reject",
            callback: async () => {
              sendToGraph({
                graph,
                operation: `SHARE_PAGE_RESPONSE/${graph}/${uid}`,
                data: {
                  success: true,
                },
              });
            },
          },
        ],
      });
    },
  });
};

export default load;
