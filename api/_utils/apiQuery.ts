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
  }).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json() as Promise<{ result: unknown[][] }>;
  });
};

export default apiQuery;
