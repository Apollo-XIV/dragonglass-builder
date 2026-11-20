/**
 * What the statuses on the sheet actually do, for the hold sheet, and the two
 * small rules around them that the UI would otherwise each re-derive.
 *
 * The wording is the SRD 5.1's, trimmed to bullets. It is reference text rather
 * than content: a condition is a state in the event log, not an element, so there
 * is nothing for a source to override.
 */

export const MAX_EXHAUSTION = 6;

/** One tap on the exhaustion row adds a level, and the level after the last is none. */
export function nextExhaustion(level: number): number {
  return level >= MAX_EXHAUSTION ? 0 : Math.max(0, level) + 1;
}

/** The Constitution save to keep concentration: half the damage, never under 10. */
export function concentrationDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

export const CONDITION_RULES: Record<string, string[]> = {
  blinded: [
    "Can't see, and automatically fails any ability check that requires sight.",
    "Attack rolls against the creature have advantage, and its attack rolls have disadvantage.",
  ],
  charmed: [
    "Can't attack the charmer or target the charmer with harmful abilities or magical effects.",
    "The charmer has advantage on any ability check to interact socially with the creature.",
  ],
  deafened: ["Can't hear, and automatically fails any ability check that requires hearing."],
  frightened: [
    "Disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.",
    "Can't willingly move closer to the source of its fear.",
  ],
  grappled: [
    "Speed becomes 0, and it can't benefit from any bonus to its speed.",
    "Ends if the grappler is incapacitated, or if an effect removes the grappled creature from the grappler's reach.",
  ],
  incapacitated: ["Can't take actions or reactions."],
  invisible: [
    "Impossible to see without the aid of magic or a special sense. For hiding, it is heavily obscured; its location can still be given away by noise or tracks.",
    "Attack rolls against the creature have disadvantage, and its attack rolls have advantage.",
  ],
  paralyzed: [
    "Incapacitated, and can't move or speak.",
    "Automatically fails Strength and Dexterity saving throws.",
    "Attack rolls against the creature have advantage.",
    "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of it.",
  ],
  petrified: [
    "Transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance. Its weight increases by a factor of ten, and it ceases aging.",
    "Incapacitated, can't move or speak, and is unaware of its surroundings.",
    "Attack rolls against the creature have advantage.",
    "Automatically fails Strength and Dexterity saving throws.",
    "Resistance to all damage, and immune to poison and disease (though any already in its system is suspended, not neutralised).",
  ],
  poisoned: ["Disadvantage on attack rolls and ability checks."],
  prone: [
    "Its only movement option is to crawl, unless it stands up and thereby ends the condition.",
    "Disadvantage on attack rolls.",
    "An attack roll against the creature has advantage if the attacker is within 5 feet of it; otherwise the attack roll has disadvantage.",
  ],
  restrained: [
    "Speed becomes 0, and it can't benefit from any bonus to its speed.",
    "Attack rolls against the creature have advantage, and its attack rolls have disadvantage.",
    "Disadvantage on Dexterity saving throws.",
  ],
  stunned: [
    "Incapacitated, can't move, and can speak only falteringly.",
    "Automatically fails Strength and Dexterity saving throws.",
    "Attack rolls against the creature have advantage.",
  ],
  unconscious: [
    "Incapacitated, can't move or speak, and is unaware of its surroundings.",
    "Drops whatever it's holding and falls prone.",
    "Automatically fails Strength and Dexterity saving throws.",
    "Attack rolls against the creature have advantage.",
    "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of it.",
  ],
};

/** Index 0 is level 1. Each level includes the effects of the ones before it. */
export const EXHAUSTION_LEVELS: string[] = [
  "Disadvantage on ability checks",
  "Speed halved",
  "Disadvantage on attack rolls and saving throws",
  "Hit point maximum halved",
  "Speed reduced to 0",
  "Death",
];

/** The 2024 rules: one formula, scaled by level, instead of a table. */
export function exhaustionLevels2024(): string[] {
  return Array.from({ length: MAX_EXHAUSTION }, (_, i) =>
    i + 1 === MAX_EXHAUSTION ? "Death" : `D20 Tests −${2 * (i + 1)}, speed −${5 * (i + 1)} ft`,
  );
}

export const EXHAUSTION_NOTE_2024 =
  "Each level reduces the result of every D20 Test (ability checks, attack rolls and saving throws) by 2, and your speed by 5 feet. The same penalty applies to spell attack rolls and spell save DCs. Finishing a long rest removes 1 level.";

export const EXHAUSTION_NOTE =
  "Effects are cumulative: a creature suffers the effect of its level and every level below it. Finishing a long rest removes 1 level, provided it has also had some food and drink.";

export const CONCENTRATION_RULES: string[] = [
  "Some spells and effects last only while you keep concentrating on them. You can't concentrate on more than one at a time.",
  "Concentration ends if you cast another spell that requires it, if you're incapacitated or killed, or if you fail a save after taking damage.",
  "When you take damage, make a Constitution saving throw. The DC is 10 or half the damage you took, whichever is higher. With several sources of damage, make a separate save for each.",
  "The DM may also call for a check when something else threatens your focus, such as a violent storm.",
];
