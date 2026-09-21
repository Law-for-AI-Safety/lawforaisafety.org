import type { ReactNode } from "react";
import { NOTE } from "./styles";
import { showDraftMarkup } from "./visibility";

/**
 * A to-do addressed to counsel. Rendered only while the policy is still a
 * draft, so publishing (see `visibility.ts`) removes every one of them without
 * editing the content files.
 */
export default function CounselNote({ children }: { children: ReactNode }) {
  if (!showDraftMarkup()) return null;
  return <p className={NOTE}>{children}</p>;
}
