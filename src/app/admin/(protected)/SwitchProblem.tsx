import { SWITCH_AREAS, type SwitchArea } from "@/lib/admin-switch";

const ADD_IT = "Ask a technical admin to add it, then switch again. You're still signed in with LinkedIn.";

function areasList(lost: string | undefined): string {
  const areas = (lost ?? "")
    .split(",")
    .filter((area): area is SwitchArea => Object.hasOwn(SWITCH_AREAS, area))
    .map((area) => SWITCH_AREAS[area]);
  if (areas.length === 0) return "parts of the admin area";
  return areas.length === 1 ? areas[0] : `${areas.slice(0, -1).join(", ")} and ${areas.at(-1)}`;
}

/**
 * Why "Switch to Google" didn't go ahead, from the `switch` and `lost` query parameters the
 * Google callback sends the admin back with. Unknown codes show nothing.
 */
export default function SwitchProblem({ code, lost }: { code?: string; lost?: string }) {
  let message: string;
  if (code === "workspace") {
    message =
      "That Google account isn't a Law for AI Safety account. Switch again, and choose your Law for AI Safety Google account.";
  } else if (code === "not_listed") {
    message = `Your Law for AI Safety Google account isn't on the admin list yet. ${ADD_IT}`;
  } else if (code === "less_access") {
    message = `Switching now would lose you access to ${areasList(lost)}, because your Law for AI Safety address isn't on those lists yet. ${ADD_IT}`;
  } else {
    return null;
  }
  return (
    <p role="alert" className="border border-brand-red bg-brand-red/10 px-4 py-3 text-brand-red">
      {message}
    </p>
  );
}
