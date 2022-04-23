import queryById from "./queryById";
import toEntity from "./toEntity";
import fromEntity from "./fromEntity";

const listNetworks = (graph: string) =>
  queryById(graph).then((items) =>
    items
      .map((item) => item.entity.S)
      .filter((id) => id !== toEntity("$network"))
      .map((id) => ({ old: id, new: fromEntity(id) }))
      .filter((ids) =>
        process.env.NODE_ENV === "development"
          ? ids.old !== ids.new
          : ids.old === ids.new
      )
      .map((ids) => ids.new)
  );

export default listNetworks;
