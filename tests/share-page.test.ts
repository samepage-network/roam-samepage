import runE2eTest from "roamjs-scripts/dist/utils/runE2eTest";
import nanoid from "nanoid";

runE2eTest("Share Page Across Graphs", ({ cy, Cypress }) => {
  // TODO create network from Roam Depo
  cy.get('input[placeholder="New Network"]').type("Vargas");
  cy.get('input[type="password"]').type("password");
  cy.get("button.bp3-intent-success").click();
  cy.get("li.roamjs-samepage-connected-network").should(
    "have.text",
    "Vargas"
  );

  const title = `SamePage Test Page - ${nanoid()}`;
  cy.get('input[placeholder="Find or Create Page"]').type(title);
  cy.get("ul.rm-find-or-create__menu").children().first().click();
  cy.get(".roam-block").first().click();
  const firstBlock = `First test block - ${nanoid()}`;
  const secondBlock = `Second test block - ${nanoid()}`;
  cy.get("textarea.rm-block-input").type(firstBlock).type("{enter}");
  cy.get("textarea.rm-block-input").type(secondBlock).type("{ctrl+p}");
  cy.get('input[placeholder="Search Commands"]')
    .type("Share Page With Graph")
    .type("{enter}");
  cy.get("#share-page-alert > input").click();
  cy.get("#share-page-alert > button").click();
});
