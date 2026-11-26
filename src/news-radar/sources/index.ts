import type { SourceAdapter, SourceId } from "../types";
import { euDigital } from "./eu-digital";
import { gdelt } from "./gdelt";
import { googleNews } from "./google-news";
import { openAlex } from "./openalex";

/** Every source the radar asks, in the order the admin page lists them. A new one is one line here. */
export const SOURCES: SourceAdapter[] = [googleNews, gdelt, openAlex, euDigital];

export const SOURCE_LABELS = Object.fromEntries(SOURCES.map((s) => [s.id, s.label])) as Record<SourceId, string>;
