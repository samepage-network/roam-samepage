const isPage = (notebookPageId: string) =>
  !!window.roamAlphaAPI.pull("[:db/id]", [":node/title", notebookPageId]);

export default isPage;
