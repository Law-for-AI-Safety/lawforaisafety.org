import type { ReactNode } from "react";
import { LIGHT_BAND, type LightTone } from "../bands";

/** The band every light block sits in, below the hero. */
export default function LightSection({
  tone,
  id,
  children,
}: {
  tone: LightTone;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${LIGHT_BAND[tone]} px-8 md:px-16 py-20 md:py-28 border-t border-brand-black/10`}>
      {children}
    </section>
  );
}
