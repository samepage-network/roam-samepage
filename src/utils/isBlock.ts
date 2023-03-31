const isBlock = (notebookPageId: string) =>
  !!window.roamAlphaAPI.pull("[:db/id]", [":block/uid", notebookPageId]);

export default isBlock;
