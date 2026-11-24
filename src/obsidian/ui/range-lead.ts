/**
 * A range as an icon and a short distance, for rows that lead their subtitle with
 * icons. Ranges are prose in the content ("60 feet", "Touch", "Self (15-foot cone)"),
 * so this reads the shapes that occur and returns nothing for the rest, which the
 * row then writes out as it always did.
 */

export interface Lead {
  /** More than one when a single fact is a set of marks, such as a spell's components. */
  icon: string | readonly string[];
  /** The whole text, for the detail sheet and screen readers. */
  label: string;
  /** What shows beside the icon; absent when the icon says it all. */
  text?: string;
  /** What hovering a lone icon says, where "Range: 60 feet" says more than the label would. */
  hint?: string;
  /** Hover text for particular icons of a group, where the fixed one would only restate the icon. */
  hints?: Readonly<Record<string, string>>;
}

/** "Self (15-foot cone)": the area's own icon, which already says it starts at the caster. */
const AREA_SHAPES: Record<string, string> = {
  cone: "dg-area-cone",
  line: "dg-area-line",
  cube: "dg-area-cube",
  sphere: "dg-area-sphere",
  hemisphere: "dg-area-sphere",
  cylinder: "dg-area-cylinder",
  radius: "dg-area-emanation",
};

const UNITS: Record<string, string> = { foot: "ft", mile: "mi" };

export function rangeLead(range: string | undefined): Lead | undefined {
  if (!range) return undefined;
  const text = range.trim();
  if (text === "Self") return { icon: "dg-range-self", label: text, hint: "Range: Self" };
  if (text === "Touch") return { icon: "dg-range-touch", label: text, hint: "Range: Touch" };

  const area = text.match(/^Self \((\d+)-(foot|mile)(?:-radius)? (\w+)\)$/);
  if (area && AREA_SHAPES[area[3]]) {
    return { icon: AREA_SHAPES[area[3]], label: text, text: `${area[1]} ${UNITS[area[2]]}`, hint: `Range: ${text}` };
  }

  // "60 feet", "20/60 ft.", "1 mile"; a ranged weapon's normal/long pair stays a pair.
  const distance = text.match(/^(\d+(?:\/\d+)?) ?(feet|ft\.?|miles?)$/);
  if (distance) {
    return {
      icon: "dg-range",
      label: text,
      text: `${distance[1]} ${distance[2].startsWith("mile") ? "mi" : "ft"}`,
      hint: `Range: ${text}`,
    };
  }
  return undefined;
}

/** What each fixed icon means, for the marks in a group where the lead's own hint can't say which. */
const ICON_HINTS: Record<string, string> = {
  "dg-verbal": "Verbal component",
  "dg-somatic": "Somatic component",
  "dg-material": "Material component",
  "dg-material-cost": "Material component with a cost",
  "dg-concentration": "Concentration",
  "dg-ritual": "Ritual",
  "dg-action": "Action",
  "dg-bonus-action": "Bonus action",
  "dg-reaction": "Reaction",
};

/** The hover text for one icon of a lead. */
export function iconHint(name: string, lead: Lead): string {
  return lead.hints?.[name] ?? (typeof lead.icon === "string" ? lead.hint : undefined) ?? ICON_HINTS[name] ?? lead.label;
}
