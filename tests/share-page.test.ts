import { cy as imported, describe, it, Cypress } from "local-cypress";
import nanoid from "nanoid";

const cy = imported as Cypress.cy;

const installation = `var existing = document.getElementById("roamjs-multiplayer-main");
if (!existing) {
  var extension = document.createElement("script");
  extension.src = "http://localhost:8000/main.js"
  extension.id = "roamjs-multiplayer-main";
  extension.async = true;
  extension.type = "text/javascript";
  document.getElementsByTagName("head")[0].appendChild(extension);
}`;

describe("Share Page Across Graphs", () => {
  it("Successfully shares a page between two pages", () => {
    cy.visit("#/signin");
    cy.get("[name=email]").type(Cypress.env("ROAM_USERNAME"));
    cy.get("[name=password]").type(Cypress.env("ROAM_USER_PASSWORD"));
    cy.get(".bp3-button").first().click();
    cy.get(".my-graphs");
    cy.visit("#/offline/testing-graph");
    cy.get(".roam-block").click();
    cy.type("{{[[roam/js]]}}{enter}");
    cy.type(`{tab}\`\`\`javascript\n${installation}\`\`\``);
    cy.get(".rm-code-warning .bp3-button").click();

    cy.type("{ctrl+u}");
    const title = `Multiplayer Test Page - ${nanoid()}`;
    cy.type(title).type("{enter}");
  });
});
