/**
 * The character export document: the one description of a resolved character that
 * leaves the plugin. Nothing here knows who reads it.
 *
 * This file is the single source of truth. The TypeScript types are `Static` over
 * these schemas and `docs/export-schema.json` is generated from them
 * (`npm run export:schema`); a test fails if the checked-in copy has drifted.
 *
 * Versioning is major.minor. Adding a field bumps the minor. Changing what a field
 * means, removing one or tightening one bumps the major. Readers must ignore fields
 * they do not know, which is why no object here forbids extra properties.
 */

import { Type, type Static } from "@sinclair/typebox";

export const EXPORT_SCHEMA_VERSION = "1.0";

const Id = Type.String({ minLength: 1, description: "An element id, e.g. srd:barbarian:rage." });
const Obj = Type.Record(Type.String(), Type.Unknown());
const Ability = Type.Union(
  ["str", "dex", "con", "int", "wis", "cha"].map((a) => Type.Literal(a)),
);
const Abilities = Type.Object({
  str: Type.Integer(),
  dex: Type.Integer(),
  con: Type.Integer(),
  int: Type.Integer(),
  wis: Type.Integer(),
  cha: Type.Integer(),
});

// -- envelope -----------------------------------------------------------------

export const ExportSource = Type.Object(
  {
    id: Type.String({ minLength: 1, description: "The source's own id, from its source.json." }),
    name: Type.Optional(Type.String()),
    version: Type.Optional(Type.String({ description: "The content version, when the source states one." })),
    ref: Type.String({
      minLength: 1,
      description:
        "What pins the content: the git tag or commit for a GitHub source, otherwise a hash of the source's files computed at export time. Never a path.",
    }),
    refType: Type.Union([Type.Literal("git"), Type.Literal("hash")], {
      description: "`git` when ref is a pin on a GitHub source, `hash` when it is a content hash.",
    }),
    sourcebooks: Type.Array(Type.String(), {
      description: "Ids of the sourcebooks this source provides. An element's `source` names one of these.",
    }),
  },
  { description: "A content source the character's elements came from." },
);

export const ExportEnvelope = Type.Object({
  schemaVersion: Type.String({ pattern: "^[0-9]+\\.[0-9]+$", description: "major.minor" }),
  characterId: Type.String({ minLength: 1, description: "The character's folder name. Stable until the folder is renamed." }),
  exportedAt: Type.String({ format: "date-time" }),
  pluginVersion: Type.String(),
  sources: Type.Array(ExportSource, { description: "Only the sources an exported element came from." }),
});

// -- provenance ---------------------------------------------------------------

export const ExportGrant = Type.Object(
  {
    id: Id,
    kind: Type.String(),
    via: Type.Array(Type.String(), {
      description: "The chain that granted it, outermost first: the class, then the feature that granted it, and so on.",
    }),
  },
  { description: "Something a class level, species or background gave the character." },
);

export const ExportChoice = Type.Object(
  {
    id: Type.String({ description: "The content's choice id." }),
    name: Type.String(),
    declaredBy: Type.String({ description: "The element that declared the choice." }),
    count: Type.Integer({ minimum: 0 }),
    picked: Type.Array(Type.String(), { description: "Active picks only, as element ids." }),
    pending: Type.Boolean({ description: "True while fewer than `count` valid picks are made. Never omitted." }),
    blocked: Type.Optional(Type.Boolean({ description: "The choice's own requirement is not met." })),
  },
  { description: "A decision the content asks for, answered or not." },
);

// -- identity -----------------------------------------------------------------

const ExportOrigin = Type.Object({
  id: Id,
  name: Type.String(),
  source: Type.String(),
  granted: Type.Array(ExportGrant, { description: "Everything it grants, with the chain of grants that led there." }),
});

export const ExportIdentity = Type.Object({
  name: Type.String(),
  level: Type.Integer({ minimum: 0 }),
  xp: Type.Optional(Type.Integer({ minimum: 0 })),
  classes: Type.Array(
    Type.Object({
      id: Id,
      name: Type.String(),
      level: Type.Integer({ minimum: 1 }),
      hitDie: Type.String(),
      subclass: Type.Optional(Type.Object({ id: Id, name: Type.String() })),
    }),
  ),
  species: Type.Optional(ExportOrigin),
  background: Type.Optional(ExportOrigin),
  abilityMethod: Type.String(),
  abilityBase: Type.Object(Abilities.properties, { description: "Scores before any bonus: what the player assigned." }),
  derived: Type.Object(
    {
      abilities: Type.Record(Type.String(), Type.Number()),
      proficiencyBonus: Type.Number(),
      hpMax: Type.Number(),
      ac: Type.Number(),
      speed: Type.Record(Type.String(), Type.Number()),
    },
    { description: "The engine's own answers, to cross-check against. Do not recompute from them." },
  ),
});

// -- progression ----------------------------------------------------------------

export const ExportHp = Type.Object({
  method: Type.Union([Type.Literal("max"), Type.Literal("average"), Type.Number()], {
    description: "How the level's hit points were taken. The character's first level is always `max`.",
  }),
  value: Type.Integer({ description: "What the die contributed, before the CON modifier." }),
  die: Type.String(),
  forced: Type.Boolean({ description: "The stored choice was overridden by the first-level rule." }),
});

export const ExportLevel = Type.Object({
  characterLevel: Type.Integer({ minimum: 1 }),
  class: Id,
  classLevel: Type.Integer({ minimum: 1 }),
  hp: ExportHp,
  choices: Type.Array(ExportChoice),
  granted: Type.Array(ExportGrant),
});

// -- features, resources ------------------------------------------------------

export const ExportPart = Type.Object(
  {
    kind: Type.Union(
      ["resource", "toggle", "passive", "action"].map((k) => Type.Literal(k)),
      {
        description:
          "resource: a pool of uses. toggle: an effect that is switched on, or an action that applies one. passive: always-on modifiers. action: something done that is neither.",
      },
    ),
    from: Type.Union(["modifiers", "resources", "actions", "effects"].map((k) => Type.Literal(k)), {
      description: "Which part list of the element it was read from.",
    }),
    definition: Obj,
  },
  { description: "One part of a feature, as authored (see docs/schema.md), with a derived kind." },
);

export const ExportFeature = Type.Object({
  id: Id,
  kind: Type.String(),
  name: Type.String(),
  source: Type.String({ description: "The sourcebook id." }),
  page: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  text: Type.Optional(Type.String({ description: "The literal source text." })),
  provenance: Type.Object({
    class: Type.Optional(Type.String()),
    classLevel: Type.Optional(Type.Integer()),
    via: Type.Array(Type.String()),
  }),
  parts: Type.Array(ExportPart),
});

export const ExportResource = Type.Object({
  key: Type.String({ description: "Globally unique pool key." }),
  id: Type.String(),
  name: Type.String(),
  max: Type.Number({ description: "Evaluated at the character's level." }),
  recharge: Type.String(),
  rechargeAmount: Type.Optional(Type.Number()),
  unit: Type.Optional(Type.String()),
  die: Type.Optional(Type.String()),
  owner: Type.String({ description: "The element that owns the resource." }),
});

// -- spells -----------------------------------------------------------------

export const ExportSpell = Type.Object({
  id: Id,
  name: Type.String(),
  level: Type.Integer({ minimum: 0 }),
  school: Type.Optional(Type.String()),
  source: Type.String(),
  class: Type.Optional(Type.String({ description: "The class whose list and ability it uses." })),
  known: Type.Boolean(),
  prepared: Type.Boolean(),
  alwaysPrepared: Type.Boolean(),
  extra: Type.Boolean({ description: "Learned outside the class's own progression." }),
});

export const ExportSpellcasting = Type.Object({
  classes: Type.Array(
    Type.Object({
      class: Id,
      ability: Ability,
      type: Type.String(),
      progression: Type.String(),
      dc: Type.Integer(),
      attack: Type.Integer(),
    }),
  ),
  slots: Type.Array(Type.Object({ level: Type.Integer(), max: Type.Integer() })),
  pact: Type.Optional(Type.Object({ level: Type.Integer(), max: Type.Integer() })),
});

// -- inventory ----------------------------------------------------------------

export const ExportItem = Type.Object({
  uid: Type.String({
    minLength: 1,
    description:
      "This entry's own id, unique in the inventory. An inventory the plugin has not saved since entries gained ids exports provisional `legacy-N` ids, which change once it is.",
  }),
  ref: Type.Optional(Type.String({ description: "The element id, for an item from content." })),
  custom: Type.Optional(Obj),
  name: Type.String(),
  kind: Type.Optional(Type.String()),
  source: Type.Optional(Type.String()),
  quantity: Type.Number({ minimum: 0 }),
  equipped: Type.Boolean(),
  attuned: Type.Boolean(),
  container: Type.Optional(Type.String({ description: "The uid of the entry holding this one." })),
  notes: Type.Optional(Type.String()),
  resolved: Type.Boolean({ description: "False when the element is in no loaded source. The entry is kept either way." }),
  reason: Type.Optional(Type.String({ description: "Why it did not resolve, or what was wrong with an entry that did." })),
});

export const ExportInventory = Type.Object({
  items: Type.Array(ExportItem),
  currency: Type.Object({
    cp: Type.Number(),
    sp: Type.Number(),
    ep: Type.Number(),
    gp: Type.Number(),
    pp: Type.Number(),
  }),
});

// -- details, diagnostics -----------------------------------------------------

export const ExportDetails = Type.Object({
  sections: Type.Array(
    Type.Object({
      heading: Type.String(),
      text: Type.String({ description: "Plain text. Links and embeds are already resolved." }),
    }),
  ),
});

export const ExportDiagnostic = Type.Object({
  severity: Type.Union([Type.Literal("error"), Type.Literal("warning"), Type.Literal("info")]),
  code: Type.String(),
  message: Type.String(),
  subject: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  file: Type.Optional(Type.String()),
  source: Type.Optional(Type.String()),
});

// -- the document -------------------------------------------------------------

export const ExportDocument = Type.Object(
  {
    envelope: ExportEnvelope,
    identity: ExportIdentity,
    progression: Type.Array(ExportLevel, { description: "Every level taken, in order. Planned levels are not here." }),
    choices: Type.Array(ExportChoice, {
      description: "Choices answered outside any class level: species, background, feats.",
    }),
    features: Type.Array(ExportFeature),
    resources: Type.Array(ExportResource),
    spells: Type.Array(ExportSpell),
    spellcasting: Type.Optional(ExportSpellcasting),
    inventory: ExportInventory,
    details: ExportDetails,
    diagnostics: Type.Array(ExportDiagnostic, { description: "The engine's own, carried through unchanged." }),
  },
  {
    $id: "https://dragonglass.local/schema/character-export.json",
    title: "Dragonglass character export",
    description:
      "A resolved, versioned description of one character: active picks only, no planned levels, no live state.",
  },
);

export type ExportDocument = Static<typeof ExportDocument>;
export type ExportSource = Static<typeof ExportSource>;
export type ExportGrant = Static<typeof ExportGrant>;
export type ExportChoice = Static<typeof ExportChoice>;
export type ExportLevel = Static<typeof ExportLevel>;
export type ExportFeature = Static<typeof ExportFeature>;
export type ExportPart = Static<typeof ExportPart>;
export type ExportResource = Static<typeof ExportResource>;
export type ExportSpell = Static<typeof ExportSpell>;
export type ExportItem = Static<typeof ExportItem>;
