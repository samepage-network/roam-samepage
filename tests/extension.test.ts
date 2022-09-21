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

const enterCommandPaletteCommand = (page: Page, command: string) =>
  test.step(`Enter command ${command}`, async () => {
    await page.keyboard.press("Meta+p");
    await expect(page.locator(".rm-command-palette")).toBeVisible();
    await expect(page.locator("*:focus")).toHaveJSProperty("tagName", `INPUT`);
    await page.locator("*:focus").press("Meta+a");
    await page.locator("*:focus").press("Backspace");
    await page.locator("*:focus").fill(command);
    await expect(page.locator(`text="${command}" >> .. >> ..`)).toHaveCSS(
      "background-color",
      "rgb(213, 218, 223)"
    );
    await page.keyboard.press("Enter");
  });

let unload: () => Promise<void>;
test.afterEach(async () => {
  await unload?.();
});
test("Should share a page with the SamePage test app", async ({ page }) => {
  const oldLog = console.log;
  const samePageClientCallbacks: Record<string, (a: unknown) => unknown> = {
    log: ({ data }) => process.env.DEBUG && oldLog(`SamePage Client:`, data),
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
  await test.step("Setup Test", async () => {
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
  });

  await test.step("Log into Roam", async () => {
    await page.goto("https://roamresearch.com/#/signin");
    await expect(page.locator(".loading-astrolabe")).toBeVisible();
    expect(page.url(), `page.url()`).toBe("https://roamresearch.com/#/signin");
    await page.locator("[name=email]").fill(process.env.ROAM_USERNAME);
    await page.locator("[name=password]").fill(process.env.ROAM_PASSWORD);
    await page.locator(".bp3-button").first().click();
    await expect(page.locator(".my-graphs")).toHaveCount(2);
  });

  const graph = "samepage-test";
  await test.step("Navigate to test graph", async () => {
    await page.goto(`https://roamresearch.com/#/offline/${graph}`);
    // await expect(page.locator(".loading-astrolabe")).toBeVisible().catch(() => {
    //   // in the rare case that Roam has already loaded
    // });
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
  });

  await enterCommandPaletteCommand(page, "Roam Depot Settings");

  await test.step("Ensure extension is Installed", async () => {
    // why is this happening on headless?
    await expect(page.locator("text=Installed Extensions"))
      .toBeVisible()
      .catch(() =>
        page.locator('.rm-settings__tab >> text="Roam Depot"').click()
      );
    await page.locator("button.bp3-icon-cog").click();
    await page.locator("text=Enable Developer Mode").click();
    await page.locator("button.bp3-icon-folder-new").click();
    await page
      .locator("div.bp3-overlay-backdrop")
      .click({ position: { x: 300, y: 16 } });
    await expect(page.locator(".rm-settings")).not.toBeVisible();
  });

  await enterCommandPaletteCommand(page, "Connect to SamePage Network");
  await expect(page.locator(".bp3-toast.bp3-intent-success")).toBeVisible();
  await page.locator("div.roam-article").click({ position: { x: 16, y: 16 } });

  const pageName = `SamePage Test ${v4().slice(0, 8)}`;
  await test.step(`Create and Navigate to ${pageName}`, async () => {
    await page.keyboard.press("Meta+Enter");
    await page.locator("*:focus").fill(`[[${pageName}]]`);
    await page.keyboard.press("Escape");
    await page
      .locator(`span[data-link-title="${pageName}"]`)
      .locator("span.rm-page-ref")
      .click();
    await expect(page.locator("h1")).toHaveText(pageName);
  });
  const testClient = await clientReady;
  unload = () =>
    new Promise<void>((resolve) => {
      samePageClientCallbacks["unload"] = resolve;
      testClient.send({ type: "unload" });
    });
  const clientNotified = new Promise<unknown>(
    (inner) => (samePageClientCallbacks["notification"] = inner)
  );

  await test.step("Enter content", async () => {
    await page
      .locator("text=Click here to start writing. Type '/' to see commands.")
      .click();
    await expect(page.locator("*:focus")).toHaveJSProperty(
      "tagName",
      "TEXTAREA"
    );
    await page.locator("*:focus").type("This is an automated test case");
  });

  await enterCommandPaletteCommand(page, "Share Page on SamePage");

  await test.step("Invite SamePage Client to page", async () => {
    await expect(page.locator(".bp3-dialog-header")).toHaveText(
      "Share Page on SamePage"
    );
    await page.locator("text=App").locator("button").click();
    await page.locator(".bp3-menu").locator("text=SamePage").click();
    await page.locator('input[placeholder="Enter workspace"]').fill("test");
    await page.locator(".bp3-icon-plus").click();
    await expect(page.locator(".bp3-toast.bp3-intent-success")).toBeVisible();
    await clientNotified;
  });
  const testClientRead = () =>
    new Promise<unknown>((resolve) => {
      samePageClientCallbacks["read"] = (value: { data: InitialSchema }) =>
        resolve(value.data);
      testClient.send({ type: "read", notebookPageId: pageName });
    });

  await test.step("Accept Shared Page from Roam", async () => {
    const acceptResponse = new Promise<unknown>((resolve) => {
      samePageClientCallbacks["accept"] = () => resolve(true);
      testClient.send({ type: "accept", notebookPageId: pageName });
    });
    await expect.poll(() => acceptResponse).toBe(true);
    await expect.poll(testClientRead).toEqual({
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
  });

  await test.step("Edit some content in Roam", async () => {
    await page
      .locator(".bp3-overlay-backdrop")
      .click({ position: { x: 300, y: 16 } });
    await expect(page.locator("text=Share Page on SamePage")).not.toBeVisible();
    await page.locator("text=This is an automated test case").click();
    await expect(page.locator("*:focus")).toHaveJSProperty(
      "tagName",
      "TEXTAREA"
    );
    await page.locator("*:focus").press("Meta+ArrowRight");
    await expect(page.locator("*:focus")).toHaveJSProperty(
      "selectionStart",
      "This is an automated test case".length
    );
    await page.locator("*:focus").type(" and we're adding edits.");
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".roam-article .rm-block-children .rm-block-main")
    ).toHaveCount(2);
    await page.locator("*:focus").type("And a new block");
    await expect.poll(testClientRead).toEqual({
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
    await page.keyboard.press("Escape");
  });

  await test.step("Insert content in samepage client", async () => {
    const insertResponse = new Promise<unknown>((resolve) => {
      samePageClientCallbacks["insert"] = () => resolve(true);
      testClient.send({
        type: "insert",
        notebookPageId: pageName,
        content: " with a response",
        index: 69,
      });
    });
    await expect.poll(() => insertResponse).toBe(true);
    await expect(
      page.locator(":nth-match(.roam-article .roam-block, 1)")
    ).toHaveText("This is an automated test case and we're adding edits.");
    await expect(
      page.locator(":nth-match(.roam-article .roam-block, 2)")
    ).toHaveText("And a new block with a response");
  });
});
