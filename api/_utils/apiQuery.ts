class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

import { JSONData } from "samepage/internal/types";

const apiQuery = ({
  token,
  query,
  graph,
}: {
  token: string;
  query: string;
  graph: string;
}) => {
  const Authorization = `Bearer ${token.replace(/^Bearer /, "")}`;
  return fetch(`https://api.roamresearch.com/api/graph/${graph}/q`, {
    body: JSON.stringify({ query }),
    headers: {
      Authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "follow",
  }).then(async (res) => {
if (!res.ok)
  throw new ApiError(
    `Failed to query Roam (${
      res.status
    }): ${await res.text()}
Query: ${query}`, res.status
  );
    return res.json() as Promise<{ result: JSONData[][] }>;
  });
};

export default apiQuery;