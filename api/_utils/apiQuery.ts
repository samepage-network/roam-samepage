import { nanoid } from "nanoid";
import { JSONData } from "samepage/internal/types";

const apiQuery = async ({
  token,
  query,
  graph,
}: {
  token: string;
  query: string;
  graph: string;
}) => {
  console.log("query", { query });
  const Authorization = `Bearer ${token.replace(/^Bearer /, "")}`;
  try {
    const url = `https://api.roamresearch.com/api/graph/${graph}/q`;
    const uniqueId = nanoid();
    const options = {
      body: JSON.stringify({ query }),
      headers: {
        "x-authorization": Authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-request-id": uniqueId,
      },
      method: "POST",
      redirect: "follow" as RequestRedirect,
    };

    // console.log("url", url);
    // console.log("query", query);
    // console.log("options", options);

    const response = await fetch(url, options);

    // const responseClone = response.clone();
    // const responseBody = await responseClone.json().catch(() => null); // Handle non-JSON responses

    // Log the response details
    // console.log("Response Details:", {
    //   url: response.url,
    //   status: response.status,
    //   statusText: response.statusText,
    //   ok: response.ok,
    //   redirected: response.redirected,
    //   type: response.type,
    //   headers: Array.from(response.headers.entries()),
    //   body: responseBody,
    // });

    if (!response.ok) {
      throw new Error(
        `Failed to query Roam (${
          response.status
        }): ${await response.text()}\nQuery: ${query}`
      );
    }

    return (await response.json()) as { result: JSONData[][] };
  } catch (error) {
    console.error(error);
    throw new Error(`Error during fetch: ${error.message}`);
  }
};

export default apiQuery;
