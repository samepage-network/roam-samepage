export const isPageBackend = async (title: string) => {
  const result = await window.roamAlphaAPI.data.fast.q(
    `[:find ?id :where [?id :node/title "${title}"]]`
  )?.[0]?.[0];
  return !!result;
};

const isPage = (notebookPageId: string) =>
  !!window.roamAlphaAPI.pull("[:db/id]", [":node/title", notebookPageId]);

export default isPage;
