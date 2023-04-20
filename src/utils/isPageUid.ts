const isPageUid = (notebookPageId: string) =>
  !!window.roamAlphaAPI.pull("[:node/title]", [":block/uid", notebookPageId])?.[
    ":node/title"
  ];

export default isPageUid;
