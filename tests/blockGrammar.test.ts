import type { InitialSchema } from "samepage/internal/types";
import { test, expect } from "@playwright/test";
import { v4 } from "uuid";
import mockRoamEnvironment from "roamjs-components/testing/mockRoamEnvironment";
import atJsonToRoam from "../src/utils/atJsonToRoam";
import createBlock from "roamjs-components/writes/createBlock";
import createPage from "roamjs-components/writes/createPage";
import registry from "samepage/internal/registry";
import blockParser from "../src/utils/blockParser";

const notebookUuid = v4();
// @ts-ignore
global.localStorage = {
  getItem: () => JSON.stringify({ uuid: notebookUuid }),
};

const runTest =
  (
    md: string,
    expected: InitialSchema,
    opts: { skipInverse?: true; debug?: true } = {}
  ) =>
  () => {
    const output = blockParser(md, opts);
    expect(output).toBeTruthy();
    expect(output).toEqual(expected);
    const backToMd = atJsonToRoam(output);
    if (!opts.skipInverse) expect(backToMd).toBe(md);
  };

test.beforeAll(() => {
  registry({ app: "roam" });
  mockRoamEnvironment();
});

test.afterAll(() => {
  delete global.window;
  delete global.document;
});

test(
  "Highlighted Text",
  runTest("A ^^highlighted^^ text", {
    content: "A highlighted text",
    annotations: [
      {
        type: "highlighting",
        start: 2,
        end: 13,
        attributes: { delimiter: "^^" },
      },
    ],
  })
);

test(
  "Strikethrough Text",
  runTest("A ~~strikethrough~~ text", {
    content: "A strikethrough text",
    annotations: [
      {
        type: "strikethrough",
        start: 2,
        end: 15,
        attributes: { delimiter: "~~" },
      },
    ],
  })
);

test(
  "Single underscore remains the same",
  runTest("A _italics_ text", {
    content: "A _italics_ text",
    annotations: [],
  })
);

test(
  "Single asterisk remains the same",
  runTest("A *italics* text", {
    content: "A *italics* text",
    annotations: [],
  })
);

test(
  "Italics text",
  runTest("An __italics__ text", {
    content: "An italics text",
    annotations: [
      { type: "italics", start: 3, end: 10, attributes: { delimiter: "__" } },
    ],
  })
);

test(
  "Bold text",
  runTest("A **bold** text", {
    content: "A bold text",
    annotations: [
      { type: "bold", start: 2, end: 6, attributes: { delimiter: "**" } },
    ],
  })
);

test(
  "Support single characters as text",
  runTest("A *, some ^, one ~, and going down _.", {
    content: "A *, some ^, one ~, and going down _.",
    annotations: [],
  })
);

test(
  "External links",
  runTest("A [linked](https://samepage.network) text", {
    content: "A linked text",
    annotations: [
      {
        type: "link",
        start: 2,
        end: 8,
        attributes: { href: "https://samepage.network" },
      },
    ],
  })
);

test(
  "Aliasless link",
  runTest("A [](https://samepage.network) text", {
    content: `A ${String.fromCharCode(0)} text`,
    annotations: [
      {
        start: 2,
        end: 3,
        type: "link",
        attributes: {
          href: "https://samepage.network",
        },
      },
    ],
  })
);

test(
  "Just a link",
  runTest("Just a link: https://samepage.network", {
    content: "Just a link: https://samepage.network",
    annotations: [],
  })
);

test(
  "Image with alias",
  runTest("![alias](https://samepage.network/images/logo.png)", {
    content: "alias",
    annotations: [
      {
        type: "image",
        start: 0,
        end: 5,
        attributes: {
          src: "https://samepage.network/images/logo.png",
        },
      },
    ],
  })
);

test(
  "Image without alias",
  runTest("![](https://samepage.network/images/logo.png)", {
    content: String.fromCharCode(0),
    annotations: [
      {
        type: "image",
        start: 0,
        end: 1,
        attributes: {
          src: "https://samepage.network/images/logo.png",
        },
      },
    ],
  })
);

test(
  "Start with link",
  runTest("https://samepage.network", {
    content: "https://samepage.network",
    annotations: [],
  })
);

test("A normal block reference", async () => {
  const parentUid = await createPage({ title: v4().slice(0, 8) });
  await createBlock({
    node: { uid: "reference", text: "referenced" },
    parentUid,
  });
  runTest("A block ((reference)) to content", {
    content: `A block ${String.fromCharCode(0)} to content`,
    annotations: [
      {
        start: 8,
        end: 9,
        type: "reference",
        attributes: {
          notebookPageId: "reference",
          notebookUuid,
        },
      },
    ],
  })();
});

test("A cross app block reference", () => {
  runTest("A {{samepage-reference:abcd1234:reference}} to content", {
    content: `A ${String.fromCharCode(0)} to content`,
    annotations: [
      {
        start: 2,
        end: 3,
        type: "reference",
        attributes: {
          notebookPageId: "reference",
          notebookUuid: "abcd1234",
        },
      },
    ],
  })();
});

test("A normal page reference", () => {
  runTest("A [[page reference]] to content", {
    content: `A ${String.fromCharCode(0)} to content`,
    annotations: [
      {
        start: 2,
        end: 3,
        type: "reference",
        attributes: {
          notebookPageId: "page reference",
          notebookUuid,
        },
        appAttributes: {
          roam: {
            kind: "wikilink",
          },
        },
      },
    ],
  })();
});

test(
  "A nested page reference",
  runTest("A page [[with [[nested]] references]] to content", {
    content: `A page ${String.fromCharCode(0)} to content`,
    annotations: [
      {
        start: 7,
        end: 8,
        type: "reference",
        attributes: {
          notebookPageId: "with [[nested]] references",
          notebookUuid,
        },
        appAttributes: {
          roam: {
            kind: "wikilink",
          },
        },
      },
    ],
  })
);

test(
  "A hashtag",
  runTest("A page #tag to content", {
    content: `A page ${String.fromCharCode(0)} to content`,
    annotations: [
      {
        start: 7,
        end: 8,
        type: "reference",
        attributes: {
          notebookPageId: "tag",
          notebookUuid,
        },
        appAttributes: {
          roam: {
            kind: "hash",
          },
        },
      },
    ],
  })
);

test(
  "A hashtagged page reference",
  runTest("A page #[[That hashtags]] to content", {
    content: `A page ${String.fromCharCode(0)} to content`,
    annotations: [
      {
        start: 7,
        end: 8,
        type: "reference",
        attributes: {
          notebookPageId: "That hashtags",
          notebookUuid,
        },
        appAttributes: {
          roam: {
            kind: "hash-wikilink",
          },
        },
      },
    ],
  })
);

test(
  "Empty block",
  runTest("", {
    content: ``,
    annotations: [],
  })
);

test(
  "Double italics",
  runTest("Deal __with__ two __sets__ of italics", {
    content: "Deal with two sets of italics",
    annotations: [
      { start: 5, end: 9, type: "italics", attributes: { delimiter: "__" } },
      { start: 14, end: 18, type: "italics", attributes: { delimiter: "__" } },
    ],
  })
);

test(
  "Just double underscore should be valid",
  runTest("Review __public pages", {
    content: "Review __public pages",
    annotations: [],
  })
);

test(
  "Just double asterisk should be valid",
  runTest("Review **public pages", {
    content: "Review **public pages",
    annotations: [],
  })
);

test(
  "A normal button",
  runTest("A normal {{button}} to press", {
    content: "A normal {{button}} to press",
    annotations: [],
  })
);

test(
  "Double page tags",
  runTest("One [[page]] and two [[pages]]", {
    content: `One ${String.fromCharCode(0)} and two ${String.fromCharCode(0)}`,
    annotations: [
      {
        start: 4,
        end: 5,
        type: "reference",
        attributes: {
          notebookPageId: "page",
          notebookUuid,
        },
        appAttributes: {
          roam: {
            kind: "wikilink",
          },
        },
      },
      {
        start: 14,
        end: 15,
        type: "reference",
        attributes: {
          notebookPageId: "pages",
          notebookUuid,
        },
        appAttributes: {
          roam: {
            kind: "wikilink",
          },
        },
      },
    ],
  })
);

test(
  "Double double bold text means no bold",
  runTest("A ****Bold**** text", {
    content: `A ${String.fromCharCode(0)}Bold${String.fromCharCode(0)} text`,
    annotations: [
      { end: 3, start: 2, type: "bold", attributes: { delimiter: "**" } },
      { end: 8, start: 7, type: "bold", attributes: { delimiter: "**" } },
    ],
  })
);

test(
  "Double double underscore text means no italic",
  runTest("A ____slanted____ text", {
    content: `A ${String.fromCharCode(0)}slanted${String.fromCharCode(0)} text`,
    annotations: [
      { end: 3, start: 2, type: "italics", attributes: { delimiter: "__" } },
      { end: 11, start: 10, type: "italics", attributes: { delimiter: "__" } },
    ],
  })
);

test(
  "Double double highlight text means no highlight",
  runTest("A ^^^^highlight^^^^ text", {
    content: `A ${String.fromCharCode(0)}highlight${String.fromCharCode(
      0
    )} text`,
    annotations: [
      {
        end: 3,
        start: 2,
        type: "highlighting",
        attributes: { delimiter: "^^" },
      },
      {
        end: 13,
        start: 12,
        type: "highlighting",
        attributes: { delimiter: "^^" },
      },
    ],
  })
);

test(
  "Double double strikethrough text means no strikethrough",
  runTest("A ~~~~struck~~~~ text", {
    content: `A ${String.fromCharCode(0)}struck${String.fromCharCode(0)} text`,
    annotations: [
      {
        end: 3,
        start: 2,
        type: "strikethrough",
        attributes: { delimiter: "~~" },
      },
      {
        end: 10,
        start: 9,
        type: "strikethrough",
        attributes: { delimiter: "~~" },
      },
    ],
  })
);

test(
  "Odd number double underscores",
  runTest("Deal __with__ odd __underscores", {
    content: `Deal with odd __underscores`,
    annotations: [
      { start: 5, end: 9, type: "italics", attributes: { delimiter: "__" } },
    ],
  })
);

test(
  "Odd number double asterisks",
  runTest("Deal **with** odd **asterisks", {
    content: `Deal with odd **asterisks`,
    annotations: [
      { start: 5, end: 9, type: "bold", attributes: { delimiter: "**" } },
    ],
  })
);

test(
  "Odd number double tilde",
  runTest("Deal ~~with~~ odd ~~tildes", {
    content: `Deal with odd ~~tildes`,
    annotations: [
      {
        start: 5,
        end: 9,
        type: "strikethrough",
        attributes: { delimiter: "~~" },
      },
    ],
  })
);

test(
  "Odd number double carot",
  runTest("Deal ^^with^^ odd ^^carots", {
    content: `Deal with odd ^^carots`,
    annotations: [
      {
        start: 5,
        end: 9,
        type: "highlighting",
        attributes: { delimiter: "^^" },
      },
    ],
  })
);

test(
  "multiple aliases",
  runTest(
    "links: [one]([nested] some text - https://samepage.network), [two](https://samepage.network), [three](https://samepage.network)",
    {
      content: "links: one, two, three",
      annotations: [
        {
          start: 7,
          end: 10,
          type: "link",
          attributes: { href: "[nested] some text - https://samepage.network" },
        },
        {
          start: 12,
          end: 15,
          type: "link",
          attributes: { href: "https://samepage.network" },
        },
        {
          start: 17,
          end: 22,
          type: "link",
          attributes: { href: "https://samepage.network" },
        },
      ],
    }
  )
);

test(
  "Code Blocks",
  runTest(
    `\`\`\`python
class SubClass(SuperClass):

    def __init__(self, **kwargs):
        super(SubClass, self).__init__(**kwargs)

    def method(self, *args, **kwargs):
        # A comment about what's going on
        self.field = Method(*pool_args, **pool_kwargs)
\`\`\``,
    {
      content:
        "class SubClass(SuperClass):\n\n    def __init__(self, **kwargs):\n        super(SubClass, self).__init__(**kwargs)\n\n    def method(self, *args, **kwargs):\n        # A comment about what's going on\n        self.field = Method(*pool_args, **pool_kwargs)\n",
      annotations: [
        {
          type: "code",
          start: 0,
          end: 249,
          attributes: {
            language: "python",
          },
          appAttributes: {
            roam: {
              defaulted: "false",
            },
          },
        },
      ],
    }
  )
);

test(
  "Code Blocks without language specified",
  runTest(
    `\`\`\`
console.log("Hello");
\`\`\``,
    {
      content: 'console.log("Hello");\n',
      annotations: [
        {
          type: "code",
          start: 0,
          end: 22,
          attributes: {
            language: "javascript",
          },
          appAttributes: {
            roam: {
              defaulted: "true",
            },
          },
        },
      ],
    }
  )
);

test(
  "Code Blocks midblock",
  runTest(
    `Check out: \`\`\`javascript
console.log("Hello");
\`\`\``,
    {
      content: 'Check out: console.log("Hello");\n',
      annotations: [
        {
          type: "code",
          start: 11,
          end: 33,
          attributes: {
            language: "javascript",
          },
          appAttributes: {
            roam: {
              defaulted: "false",
            },
          },
        },
      ],
    }
  )
);

test(
  "book ending references",
  runTest("[[First]] reference and [[second]]", {
    content: `${String.fromCharCode(0)} reference and ${String.fromCharCode(
      0
    )}`,
    annotations: [
      {
        attributes: { notebookUuid, notebookPageId: "First" },
        end: 1,
        start: 0,
        type: "reference",
        appAttributes: {
          roam: {
            kind: "wikilink",
          },
        },
      },
      {
        attributes: { notebookUuid, notebookPageId: "second" },
        end: 17,
        start: 16,
        type: "reference",
        appAttributes: {
          roam: {
            kind: "wikilink",
          },
        },
      },
    ],
  })
);

test(
  "alias for internal reference",
  runTest("Internal [alias]([[reference]])", {
    content: "Internal alias",
    annotations: [
      {
        attributes: { href: "[[reference]]" },
        end: 14,
        start: 9,
        type: "link",
      },
    ],
  })
);
