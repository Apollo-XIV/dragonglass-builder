/** The pure rules engine: no Obsidian imports anywhere below this barrel. */

export * from "./types";
export { ContentIndex } from "./content/index";
export type { LoadedSource, ElementOrigin, OverrideRecord } from "./content/index";
export { validateElement } from "./content/validate";
export { checkRequirement, describeRequirement, describePredicate } from "./content/requirements";
export type { RequirementContext, RequirementResult } from "./content/requirements";
export { bundleToLoadedSource, parseManifest } from "./content/source-bundle";
export type { SourceBundle, SourceFile, SourceManifest } from "./content/source-bundle";
export { evaluate, tryEvaluate, checkExpression, resolveDice, dependencies } from "./expr/evaluate";
export type { ExprContext } from "./expr/evaluate";
export { ExprError, parseExpression } from "./expr/parser";
export { resolve, resourceKey, allAnnotations } from "./resolver/resolve";
export type { ResolveInput, ResolveOptions } from "./resolver/resolve";
export * from "./resolver/resolved";
export { armorModifiers, answerFor } from "./resolver/collect";
export {
  casterLevel,
  slotsForCasterLevel,
  pactSlots,
  proficiencyBonusFor,
  averageForDie,
  maxForDie,
} from "./resolver/spellslots";
export {
  foldState,
  appendEvent,
  undoLast,
  takeCheckpoint,
  emptyState,
  emptyCheckpoint,
  currentHp,
  tempMaxHpTotal,
  canonicalPoolKey,
  bucketOf,
  describeEvent,
  event,
  nowIso,
} from "./state/fold";
export type { FoldRules, LiveState, PoolRule } from "./state/fold";
