// THIS FILE IS UNDER HEAVY DEVELOPMENT
// We are working on the new protocol for cross-notebook workflows.
import { OnloadArgs } from "roamjs-components/types";
import { JSONData, SamePageAPI, SamePageState } from "samepage/internal/types";
import encodeState from "../utils/encodeState";
import renderToast from "roamjs-components/components/Toast";
import decodeState from "../utils/decodeState";

type WorkflowContext = {
  variables: JSONData;
  target: string;
};

type WorkflowParameters = {
  state: SamePageState;
  context: WorkflowContext;
};

const processAnnotations = async ({
  state,
  context,
}: WorkflowParameters): Promise<SamePageState> => state;

const triggerWorkflow = async ({ state, context }: WorkflowParameters) => {
  const output = await processAnnotations({ state, context });
  await decodeState(context.target, output.$body);
};

const crossNotebookWorkflows = (api: SamePageAPI, args: OnloadArgs) => {
  args.extensionAPI.ui.commandPalette.addCommand({
    label: "Trigger SamePage Workflow",
    callback: async () => {
      const target = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const workflowNotebookPageId = "Slack SamePage";
      const state = await encodeState(workflowNotebookPageId);
      if (!state.SamePage) {
        renderToast({
          content: "SamePage is not installed in the workflow notebook!",
          id: "Selected page is not a SamePage workflow",
        });
        return;
      }
      triggerWorkflow({
        state,
        context: { variables: {}, target },
      });
    },
  });
  return () => {};
};

export default crossNotebookWorkflows;
