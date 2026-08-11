import client from "../../tina/__generated__/client";
import HomeClient from "./HomeClient";

export default async function Home() {
  const result = await client.queries.content({ relativePath: "home.json" });

  return (
    <HomeClient
      data={result.data}
      query={result.query}
      variables={result.variables}
    />
  );
}
