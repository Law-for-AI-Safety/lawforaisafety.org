import HomeClient from "./HomeClient";
import content from "../../content/home.json";

export default function Home() {
  return <HomeClient initialData={content} />;
}
