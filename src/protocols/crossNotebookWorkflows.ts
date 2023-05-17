// THIS FILE IS UNDER HEAVY DEVELOPMENT
// We are working on the new protocol for cross-notebook workflows.
import { OnloadArgs, PullBlock } from "roamjs-components/types";
import {
  JSONData,
  SamePageAPI,
  SamePageState,
  referenceAnnotation,
  zSamePageSchema,
} from "samepage/internal/types";
import encodeState from "../utils/encodeState";
import renderToast from "roamjs-components/components/Toast";
import decodeState from "../utils/decodeState";
import { render as renderFormDialog } from "roamjs-components/components/FormDialog";
import { z } from "zod";
import { NULL_TOKEN } from "samepage/utils/atJsonParser";
import { getSetting } from "samepage/internal/registry";
import atJsonToRoam from "src/utils/atJsonToRoam";
import { SamePageSchema } from "samepage/internal/types";
import apiClient from "samepage/internal/apiClient";

type ReferenceAnnotation = z.infer<typeof referenceAnnotation>;

type WorkflowContext = {
  variables: JSONData;
  target: string;
  exitWorkflow?: true;
};

type WorkflowParameters = {
  state: SamePageState;
  context: WorkflowContext;
};

type CommandHandler = (
  args: Record<string, string>,
  context: WorkflowContext
) => SamePageSchema | Promise<SamePageSchema>;
const samePageCommands: Record<
  string,
  { handler: CommandHandler; help?: string }
> = {
  GET: {
    handler: async ({ key }, { variables }) => {
      const value = variables[key];
      if (typeof value === "undefined" || value === null)
        return { content: "", annotations: [] };
      return {
        content: value.toString(),
        annotations: [],
      };
    },
  },
  SET: {
    handler: async ({ key, value }, { variables }) => {
      variables[key] = value;
      return {
        content: "",
        annotations: [],
      };
    },
  },
};

const processAnnotations = async ({
  state,
  context,
}: WorkflowParameters): Promise<SamePageSchema> => {
  const notebookUuid = getSetting("uuid");
  return state.$body.annotations
    .filter(
      (a): a is ReferenceAnnotation =>
        a.type === "reference" &&
        state.$body.content.slice(a.start, a.end) === NULL_TOKEN
    )
    .map((a) => async (prev: SamePageSchema) => {
      if (context.exitWorkflow) return;
      // TODO - Cross notebook referenced commands!! We may never want to support this
      if (a.attributes.notebookUuid !== notebookUuid) return;
      const command = await encodeState(a.attributes.notebookPageId);
      if (!("$command" in command)) return;
      const {
        $command,
        $context = { content: "samepage", annotations: [] },
        // $returns = { content: "text", annotations: [] },
        ...$args
      } = command;
      const text = atJsonToRoam($command).trim();
      const commandContext = atJsonToRoam($context).trim();
      // const returns = atJsonToRoam($returns);
      const args = Object.fromEntries(
        Object.entries($args).map(([k, v]) => [k, atJsonToRoam(v).trim()])
      );
      const value =
        commandContext === "samepage"
          ? !samePageCommands[text]
            ? { content: "", annotations: [] }
            : await samePageCommands[text].handler(args, context)
          : await apiClient({
              // @ts-ignore TODO install deps
              method: "call-workflow-command",
              text,
              commandContext,
              args,
              workflowContext: context,
            })
              .then((r) => zSamePageSchema.parseAsync(r.response))
              .catch((e) => ({
                content: `Failed to run ${text} from ${commandContext}: ${e.message}`,
                annotations: [],
              }));
      const offset = value.content.length - 1;
      return {
        content: `${prev.content.slice(0, a.start)}${
          value.content
        }${prev.content.slice(a.end)}`,
        annotations: prev.annotations
          .filter((pa) => pa !== a)
          .map((pa) => {
            if (pa.start > a.start) {
              pa.start += offset;
            }
            if (pa.end > a.start) {
              pa.end += offset;
            }
            return pa;
          }),
      };
    })
    .reduce((prev, curr) => prev.then(curr), Promise.resolve(state.$body));
};

const triggerWorkflow = async ({ state, context }: WorkflowParameters) => {
  const output = await processAnnotations({ state, context });
  await decodeState(context.target, output);
};

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
  return () => {};
};

export default crossNotebookWorkflows;
