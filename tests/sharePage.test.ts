import { expect, test } from "@playwright/test";
import { v4 } from "uuid";
import { applyState } from "../src/protocols/sharePageWithNotebook";
import Automerge from "automerge";
import mockRoamEnvironment from "./mockRoamEnvironment";
import createPage from "roamjs-components/writes/createPage";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";

const mockOnLoadArgs = {
  extension: {
    version: "TEST",
  },
  extensionAPI: {
    settings: {
      get: () => "",
      getAll: () => ({}),
      panel: {
        create: async () => {},
      },
      set: async () => {},
    },
  },
};

test.beforeAll(() => {
  mockRoamEnvironment();
});

test("`applyState` handles a tree with multiple indentation", async () => {
  const notebookPageId = v4();
  const pageUid = await createPage({
    title: notebookPageId,
  });
  const state = {
    annotations: [
      {
        attributes: { level: 1, viewType: "bullet" as const },
        end: 9,
        start: 0,
        type: "block" as const,
      },
      {
        attributes: { level: 2, viewType: "bullet" as const },
        end: 29,
        start: 9,
        type: "block" as const,
      },
      {
        attributes: { level: 3, viewType: "bullet" as const },
        end: 47,
        start: 29,
        type: "block" as const,
      },
      {
        attributes: { level: 2, viewType: "bullet" as const },
        end: 65,
        start: 47,
        type: "block" as const,
      },
      {
        attributes: { level: 2, viewType: "bullet" as const },
        end: 79,
        start: 65,
        type: "block" as const,
      },
      {
        attributes: { level: 1, viewType: "bullet" as const },
        end: 88,
        start: 79,
        type: "block" as const,
      },
    ],
    content: new Automerge.Text(
      "Business\nGoals for this week\nSetting up emails\nPublish to Stores\nWrite Content\nShalom t\n"
    ),
    contentType: "application/vnd.atjson+samepage; version=2022-08-17" as const,
  };
  await applyState(notebookPageId, state, mockOnLoadArgs);
  const tree = getBasicTreeByParentUid(pageUid);
  expect(tree[0].text).toEqual("Business");
  expect(tree[0].children).toHaveLength(3);
  expect(tree[0].children[0].text).toEqual("Goals for this week");
  expect(tree[0].children[0].children).toHaveLength(1);
  expect(tree[0].children[0].children[0].text).toEqual("Setting up emails");
  expect(tree[0].children[1].text).toEqual("Publish to Stores");
  expect(tree[0].children[2].text).toEqual("Write Content");
  expect(tree[1].text).toEqual("Shalom t");
});
