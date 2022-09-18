import { Page, test, expect } from "@playwright/test";
import fs from "fs";
import { v4 } from "uuid";
import createTestSamePageClient from "samepage/testing/createTestSamePageClient";
import { InitialSchema } from "samepage/types";

declare global {
  interface Window {
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
  }
}

const enterCommandPaletteCommand = async (page: Page, command: string) => {
  await page.keyboard.press("Meta+p");
  await expect(page.locator(".rm-command-palette")).toBeVisible();
  await expect(page.locator("*:focus")).toHaveJSProperty("tagName", `input`);
  await page.locator("*:focus").press("Meta+a");
  await page.locator("*:focus").press("Backspace");
  await page.locator("*:focus").type(command);
  await expect(page.locator(`text=${command}`)).toBeVisible();
  await page.keyboard.press("Enter");
};

let unload: () => Promise<void>;
test.afterEach(async () => {
  await unload?.();
});
test("Should share a page with the SamePage test app", async ({ page }) => {
  const oldLog = console.log;
  oldLog("Starting test...");
  const samePageClientCallbacks: Record<string, (a: unknown) => unknown> = {
    log: (data) => oldLog(data),
    error: (message) => {
      throw new Error(message as string);
    },
  };
  const clientReady = new Promise<
    Awaited<ReturnType<typeof createTestSamePageClient>>
  >((resolve) => {
    samePageClientCallbacks["ready"] = () => resolve(client);
    const client = createTestSamePageClient({
      workspace: "test",
      onMessage: ({ type, ...data }) => samePageClientCallbacks[type]?.(data),
    });
  });
  await page.addInitScript((content: Record<string, string>) => {
    class MockFileSystemDirectoryHandle implements FileSystemDirectoryHandle {
      constructor() {}
      kind = "directory" as const;
      name = "roamjs-samepage";

      async getDirectoryHandle(name: string) {
        return Promise.reject(`No subdirectories with name ${name}`);
      }
      async getFileHandle(name: string) {
        return {
          kind: "file" as const,
          name,
          isSameEntry: async () => false,
          getFile: async () => new File([content[name]], name),
        };
      }
      async isSameEntry() {
        return false;
      }
      async removeEntry(name: string) {
        return Promise.reject(`\`removeEntry\` of ${name} is not supported`);
      }
      async resolve() {
        return ["roamjs-samepage"];
      }
      async queryPermission() {
        return "granted";
      }
    }

    window.showDirectoryPicker = async () =>
      new MockFileSystemDirectoryHandle();
  }, Object.fromEntries(["extension.js", "extension.css", "README.md", "CHANGELOG.md"].filter((f) => fs.existsSync(f)).map((f) => [f, fs.readFileSync(f).toString()])));
  await page.goto("https://roamresearch.com/#/signin");
  await page.locator(".loading-astrolabe");
  expect(page.url(), `page.url()`).toBe("https://roamresearch.com/#/signin");
  await page.locator("[name=email]").type(process.env.ROAM_USERNAME);
  await page.locator("[name=password]").type(process.env.ROAM_PASSWORD);
  await page.locator(".bp3-button").first().click();
  await page.locator(".my-graphs");
  const graph = "samepage-test";
  await page.goto(`https://roamresearch.com/#/offline/${graph}`);
  await expect(page.locator(".loading-astrolabe")).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  await page
    .locator("text=Local graphs live in your browser's local storage")
    .locator("..")
    .locator("..")
    .locator("..")
    .locator(".bp3-icon-cross")
    .click();
  await page
    .locator("text=Roam Help")
    .locator("..")
    .locator(".bp3-icon-cross")
    .click();
  await enterCommandPaletteCommand(page, "Roam Depot Settings");
  await page.locator("button.bp3-icon-cog").click();
  await page.locator("text=Enable Developer Mode").click();
  await page.locator("button.bp3-icon-folder-new").click();
  await page
    .locator("div.bp3-overlay-backdrop")
    .click({ position: { x: 300, y: 16 } });
  await enterCommandPaletteCommand(page, "Connect to SamePage Network");
  await expect(page.locator(".bp3-toast.bp3-intent-success")).toBeVisible();
  await page.locator("div.roam-article").click({ position: { x: 16, y: 16 } });
  const pageName = `SamePage Test ${v4().slice(0, 8)}`;
  await page.keyboard.press("Meta+Enter");
  await page.locator("*:focus").type(`[[${pageName}]]`);
  await page.keyboard.press("Escape");
  await page
    .locator(`span[data-link-title="${pageName}"]`)
    .locator("span.rm-page-ref")
    .click();
  await expect(page.locator("h1")).toHaveText(pageName);
  await page
    .locator("text=Click here to start writing. Type '/' to see commands.")
    .click();
  await expect(page.locator("*:focus")).toHaveJSProperty("tagName", "textarea");
  await page.locator("*:focus").type("This is an automated test case");
  const testClient = await clientReady;
  unload = () =>
    new Promise<void>((resolve) => {
      samePageClientCallbacks["unload"] = resolve;
      testClient.send({ type: "unload" });
    });

  const clientNotified = new Promise<unknown>(
    (inner) => (samePageClientCallbacks["notification"] = inner)
  );
  await enterCommandPaletteCommand(page, "Share Page on SamePage");
  await expect(page.locator(".bp3-dialog-header")).toHaveText(
    "Share Page on SamePage"
  );
  await page.locator("text=App").locator("button").click();
  await page.locator(".bp3-menu").locator("text=SamePage").click();
  await page.locator('input[placeholder="Enter workspace"]').type("test");
  await page.locator(".bp3-icon-plus").click();
  await page.locator(".bp3-toast.bp3-intent-success");
  await clientNotified;
  await new Promise<unknown>((resolve) => {
    samePageClientCallbacks["accept"] = resolve;
    testClient.send({ type: "accept", notebookPageId: pageName });
  });
  const initialAcceptData = await new Promise<unknown>((resolve) => {
    samePageClientCallbacks["read"] = (value: { data: InitialSchema }) =>
      resolve(value.data);
    testClient.send({ type: "read", notebookPageId: pageName });
  });
  expect(initialAcceptData, `initialAcceptData`).toEqual({
    content: "This is an automated test case",
    annotations: [
      {
        type: "block",
        start: 0,
        end: 30,
        attributes: { viewType: "bullet", level: 1 },
      },
    ],
  });

  await page
    .locator(".bp3-overlay-backdrop")
    .click({ position: { x: 300, y: 16 } });
  await page.locator("text=This is an automated test case").click();
  await page.locator("*:focus").press("Meta+ArrowRight");
  await expect(page.locator("*:focus")).toHaveJSProperty(
    "selectionStart",
    "This is an automated test case".length.toString()
  );
  await page.locator("*:focus").type(" and we're adding edits.");
  await page.keyboard.press("Enter");
  await page.locator("*:focus").type("And a new block");

  const readData = () =>
    new Promise<unknown>((resolve) => {
      samePageClientCallbacks["read"] = (value: { data: InitialSchema }) =>
        resolve(value.data);
      testClient.send({ type: "read", notebookPageId: pageName });
    });
  await expect.poll(readData).toEqual({
    content:
      "This is an automated test case and we're adding edits.And a new block",
    annotations: [
      {
        type: "block",
        start: 0,
        end: 54,
        attributes: { viewType: "bullet", level: 1 },
      },
      {
        type: "block",
        start: 54,
        end: 69,
        attributes: { viewType: "bullet", level: 1 },
      },
    ],
  });
  await new Promise<unknown>((resolve) => {
    samePageClientCallbacks["insert"] = resolve;
    testClient.send({
      type: "insert",
      notebookPageId: pageName,
      content: " with a response",
      index: 15,
    });
  });
  await expect(page.locator(":nth-match(.roam-block, 1)")).toHaveText(
    "This is an automated test case and we're adding edits."
  );
  await expect(page.locator(":nth-match(.roam-block, 2)")).toHaveText(
    "And a new block with a response"
  );
});
