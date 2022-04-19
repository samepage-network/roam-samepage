const rejectSharePageResponse = async ({ graph }: Record<string, string>) => {
  window.roamjs.extension.multiplayer.sendToGraph({
    graph,
    operation: `SHARE_PAGE_RESPONSE`,
    data: {
      success: false,
    },
  });
};

export default rejectSharePageResponse;
