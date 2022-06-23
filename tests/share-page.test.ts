import runE2eTest from "roamjs-scripts/dist/utils/runE2eTest";
import nanoid from "nanoid";

runE2eTest("Share Page Across Graphs", ({ cy, Cypress }) => {
  const title = `Multiplayer Test Page - ${nanoid()}`;
  cy.get("input[placeholder=\"Find or Create Page\"]").type(title).type("{enter}");
  cy.get(".roam-block").first().click();
  const firstBlock = `First test block - ${nanoid()}`;
  const secondBlock = `Second test block - ${nanoid()}`;
  cy.get("textarea.rm-block-input")
    .type(firstBlock)
    .type("{enter}")
    .type(secondBlock)
    .type("{ctrl+p}")
    .type("Share Page With Graph")
    .type("{enter}");
});
