import { OnloadArgs, PullBlock } from "roamjs-components/types";
import { SamePageAPI } from "samepage/internal/types";
import encodeState from "../utils/encodeState";
import renderToast from "roamjs-components/components/Toast";
import decodeState from "../utils/decodeState";
import { render as renderFormDialog } from "roamjs-components/components/FormDialog";
import setupCrossNotebookWorkflows from "samepage/protocols/crossNotebookWorkflows";

const listWorkflows = () =>
  (
    window.roamAlphaAPI.data.fast.q(`[:find
  (pull ?page [:node/title :block/uid :block/string])
:where
  [?attr :node/title "SamePage"]
  [?attr :block/uid ?u]
  [?page :entity/attrs ?e]
  [(untuple ?e) [[?f ?t]]]
  [(get ?t :value) [?b ?u]]
]`) as [PullBlock][]
  ).map((a) => ({
    title: a[0]?.[":node/title"] || a[0]?.[":block/string"],
    notebookPageId: a[0]?.[":block/uid"],
  }));

const crossNotebookWorkflows = (_api: SamePageAPI, args: OnloadArgs) => {
  const { unload, triggerWorkflow } = setupCrossNotebookWorkflows({
    encodeState,
    decodeState,
  });
  args.extensionAPI.ui.commandPalette.addCommand({
    label: "Trigger SamePage Workflow",
    callback: async () => {
      const target = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const potentialSources = listWorkflows();

      // TODO - options should be a list of id/label pairs
      const sourceByTitle = Object.fromEntries(
        potentialSources.map(({ title, notebookPageId }) => [
          title,
          notebookPageId,
        ])
      );
      renderFormDialog({
        title: "Run SamePage Workflow",
        fields: {
          workflow: {
            type: "select",
            label: "Workflow",
            options: Object.keys(sourceByTitle),
          },
        },
        onSubmit: async ({ workflow }) => {
          const workflowNotebookPageId = sourceByTitle[workflow as string];
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
    },
  });
  return unload;
};

export default crossNotebookWorkflows;
