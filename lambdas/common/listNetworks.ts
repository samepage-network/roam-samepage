import queryById from "./queryById";

const listNetworks = (graph: string) =>
  queryById(graph).then((items) =>
    items.map((item) => item.entity.S).filter((id) => !id.includes("$network"))
  );

export default listNetworks;
