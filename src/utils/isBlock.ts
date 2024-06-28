export const isBlockBackend = async (uid: string) => {
  const result = await window.roamAlphaAPI.data.fast.q(
    `[:find ?id :where [?id :block/uid "${uid}"]]`
  );
  return !!result?.[0]?.[0];
};

const isBlock = (notebookPageId: string) =>
  !!window.roamAlphaAPI.pull("[:db/id]", [":block/uid", notebookPageId]);

export default isBlock;
