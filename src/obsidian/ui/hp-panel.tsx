/**
 * The hit point panel: a vial on the left, a register on the right.
 *
 * It belongs to neither layout. The desktop sheet puts it in the top row and the
 * narrow layout can drop it into its overview; the only difference between them
 * is that a phone needs a symbol strip above the calc and a keyboard doesn't.
 *
 * Three rules shape it:
 *
 * - Nothing is stored but events. The register is the log read back (`hpRegister`),
 *   so undo is the plugin's undo and the panel has none of its own.
 * - The calc is parsed, not evaluated. `parseHpCalc` turns the text into tokens
 *   and `applyHpCalc` says what they would do; the same call drives the live
 *   preview and the commit.
 * - A pending entry is visible. Losing focus with text still in the box leaves
 *   the ghosts up, because a forgotten entry that looks committed is worse than
 *   one that looks pending.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { explainStat } from "../../core/resolver/explain";
import type { ResolvedCharacter } from "../../core/resolver/resolved";
import { event } from "../../core/state/fold";
import {
  applyHpCalc,
  formatDelta,
  parseHpCalc,
  type HpOutcome,
  type HpToken,
} from "../../core/state/hp-calc";
import { hpRegister, type RegisterRow } from "../../core/state/register";
import type { CharacterStore } from "../character-store";
import { Icon } from "./components";
import { useSheet } from "./narrow/sheet";
import { TextBody } from "./narrow/targets";

export function HpPanel({
  store,
  character,
  /** A phone has no keyboard worth typing `=m4` on, so it gets the symbol strip. */
  symbolStrip = false,
}: {
  store: CharacterStore;
  character: ResolvedCharacter;
  symbolStrip?: boolean;
}): ReactNode {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const snapshot = {
    baseMax: character.hp.max.value,
    damage: character.hp.damage,
    temp: character.hp.temp,
    tempMaxEffects: character.status.tempMaxHpEffects.map((e) => ({ id: e.id, amount: e.amount })),
  };

  const parse = useMemo(() => parseHpCalc(text), [text]);
  // The preview is the commit, run without committing: one code path, so what the
  // vial shows is what Enter does.
  const preview: HpOutcome | undefined =
    text.trim() && !parse.error && parse.tokens.length ? applyHpCalc(parse.tokens, snapshot, "preview") : undefined;

  const rows = useMemo(
    () => hpRegister(store.data.state, store.foldRules(), character.hp.max.value),
    // The log is what the rows are made of, so the store is the input that
    // matters; `character` changes with every event appended to it.
    [store, character],
  );

  const commit = (): void => {
    if (!text.trim()) return;
    const parsed = parseHpCalc(text);
    if (parsed.error || !parsed.tokens.length) return;
    const outcome = applyHpCalc(parsed.tokens, snapshot);
    store.appendEvents(...outcome.events);
    setText("");
    // The input keeps focus: the next entry usually follows the last one closely.
    input.current?.focus();
  };

  const dying = character.hp.current === 0;

  return (
    <div className={preview ? "dg-hp-panel has-pending" : "dg-hp-panel"}>
      {dying ? (
        <DeathSaves store={store} character={character} />
      ) : (
        <Vial character={character} preview={preview} />
      )}
      <div className="dg-hp-right">
        <Register character={character} rows={rows} />
        <Readout
          character={character}
          preview={preview}
          text={text}
          tokens={parse.tokens}
          error={parse.error}
          editing={editing}
          inputRef={input}
          onText={setText}
          onOpen={() => {
            setEditing(true);
            window.setTimeout(() => input.current?.focus(), 0);
          }}
          onCommit={commit}
          onCancel={() => {
            setText("");
            setEditing(false);
          }}
          symbolStrip={symbolStrip}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The vial
// ---------------------------------------------------------------------------

/**
 * A vertical gauge. Current HP fills from the bottom in red, temp HP stacks above
 * it in blue, and temp max HP moves the ceiling: a tinted band above a dashed line
 * at base max when positive, a blocked-off cap when negative.
 *
 * Pending changes are drawn as a diff rather than as the new value — lost HP keeps
 * a dashed ghost at its old level and gained HP shows green above the fill — so an
 * uncommitted entry can never be mistaken for a committed one.
 */
function Vial({ character, preview }: { character: ResolvedCharacter; preview?: HpOutcome }): ReactNode {
  const base = character.hp.max.value;
  const tempMax = character.hp.tempMax;
  const current = character.hp.current;
  const temp = character.hp.temp;

  // Everything is a percentage of the tallest thing the vial has to show, so a
  // pending heal and a positive temp max both stay inside it.
  const ceiling = Math.max(base + Math.max(0, tempMax), base + Math.max(0, preview?.tempMax ?? 0), current + temp, 1);
  const pct = (n: number): string => `${Math.max(0, Math.min(100, (n / ceiling) * 100))}%`;

  const next = preview ? { current: preview.current, temp: preview.temp, tempMax: preview.tempMax } : undefined;
  const gained = next ? Math.max(0, next.current - current) : 0;
  const lost = next ? Math.max(0, current - next.current) : 0;
  const tempLost = next ? Math.max(0, temp - next.temp) : 0;
  const tempGained = next ? Math.max(0, next.temp - temp) : 0;
  const shownCurrent = next ? Math.min(current, next.current) : current;
  const shownTemp = next ? Math.min(temp, next.temp) : temp;

  return (
    <div className="dg-hp-vial" aria-hidden="true">
      {/* The ceiling, when a temporary change has moved it. */}
      {tempMax > 0 ? (
        <>
          <span className="dg-hp-tempmax-band" style={{ height: pct(tempMax), bottom: pct(base) }} />
          <span className="dg-hp-basemax-line" style={{ bottom: pct(base) }} />
        </>
      ) : null}
      {tempMax < 0 ? (
        <>
          <span className="dg-hp-blocked" style={{ height: pct(-tempMax), bottom: pct(base + tempMax) }} />
          <span className="dg-hp-basemax-line" style={{ bottom: pct(base + tempMax) }} />
        </>
      ) : null}

      <span className="dg-hp-fill" style={{ height: pct(shownCurrent) }} />
      {gained ? <span className="dg-hp-gain" style={{ height: pct(gained), bottom: pct(current) }} /> : null}
      {lost ? <span className="dg-hp-ghost" style={{ height: pct(lost), bottom: pct(next?.current ?? 0) }} /> : null}

      {shownTemp ? <span className="dg-hp-temp" style={{ height: pct(shownTemp), bottom: pct(shownCurrent) }} /> : null}
      {tempLost ? (
        <span className="dg-hp-temp-ghost" style={{ height: pct(tempLost), bottom: pct(shownCurrent + shownTemp) }} />
      ) : null}
      {tempGained ? (
        <span className="dg-hp-temp-gain" style={{ height: pct(tempGained), bottom: pct(shownCurrent + shownTemp) }} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Death saves
// ---------------------------------------------------------------------------

/**
 * At 0 HP the vial has nothing to show, so it becomes the six pips instead:
 * three successes, a divider, three failures. Clicking a pip sets that side's
 * count to it; clicking the topmost lit one takes it back. Three failures is
 * death, three successes stable, and any healing resets both through the fold.
 */
function DeathSaves({ store, character }: { store: CharacterStore; character: ResolvedCharacter }): ReactNode {
  const { successes, failures } = character.status.deathSaves;

  /**
   * The log only knows "one more success"; setting a count to something lower
   * means resetting and replaying. Both sides are replayed, because a reset
   * clears both.
   */
  const set = (result: "success" | "failure", to: number): void => {
    const from = result === "success" ? successes : failures;
    const target = to === from ? to - 1 : to;
    if (target > from) {
      for (let i = from; i < target; i += 1) store.appendEvents(event("death-save", { result }));
      return;
    }
    const other = result === "success" ? failures : successes;
    const otherResult = result === "success" ? "failure" : "success";
    store.appendEvents(
      event("death-save", { result: "reset" }),
      ...Array.from({ length: other }, () => event("death-save", { result: otherResult })),
      ...Array.from({ length: Math.max(0, target) }, () => event("death-save", { result })),
    );
  };

  const state = failures >= 3 ? "dead" : successes >= 3 ? "stable" : "dying";

  return (
    <div className={`dg-hp-death is-${state}`}>
      <span className="dg-hp-death-label">{state === "dead" ? "Dead" : state === "stable" ? "Stable" : "Dying"}</span>
      <div className="dg-hp-death-pips">
        {[1, 2, 3].map((n) => (
          <button
            key={`s${n}`}
            type="button"
            className={n <= successes ? "dg-hp-pip is-success is-on" : "dg-hp-pip is-success"}
            aria-label={`Death save success ${n}`}
            aria-pressed={n <= successes}
            onClick={() => set("success", n)}
          />
        ))}
        <span className="dg-hp-death-divider" />
        {[1, 2, 3].map((n) => (
          <button
            key={`f${n}`}
            type="button"
            className={n <= failures ? "dg-hp-pip is-failure is-on" : "dg-hp-pip is-failure"}
            aria-label={`Death save failure ${n}`}
            aria-pressed={n <= failures}
            onClick={() => set("failure", n)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

/**
 * A till roll. The sticky top row is the maximum; under it, one row per commit,
 * newest at the bottom, scrolled to the end. The fade at the top is deliberate:
 * it says the older entries are still there rather than pretending they aren't.
 */
function Register({ character, rows }: { character: ResolvedCharacter; rows: RegisterRow[] }): ReactNode {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  return (
    <div className="dg-hp-register">
      <div className="dg-hp-register-head">
        <span className="dg-hp-register-max">{character.hp.max.value}</span>
        {character.hp.tempMax !== 0 ? (
          <span className="dg-hp-register-tempmax">
            {character.hp.tempMax > 0 ? "+" : "−"}
            {Math.abs(character.hp.tempMax)}
          </span>
        ) : null}
      </div>
      <div className="dg-hp-register-rows" ref={scroller}>
        {rows.length === 0 ? <p className="dg-hp-register-empty">No changes yet.</p> : null}
        {rows.map((row, i) => (
          <div className="dg-hp-register-row" key={`${row.t}-${i}`} title={row.label ?? formatTime(row.t)}>
            <div className="dg-hp-register-row-inner">
              <span className="dg-hp-register-balance">
                {row.current}
                {row.temp ? <span className="dg-hp-temp-text"> +{row.temp}</span> : null}
              </span>
              <span className="dg-hp-register-leader" />
              <span className="dg-hp-register-deltas">
                {row.label && !row.deltas.length ? <span className="dg-hp-register-note">{row.label}</span> : null}
                {row.deltas.map((delta, j) => (
                  <span key={j} className={`dg-hp-delta is-${delta.role}`}>
                    {formatDelta(delta)}
                  </span>
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// The readout and the calc
// ---------------------------------------------------------------------------

const SYMBOLS = ["+", "−", "=", "t", "m"];

function Readout({
  character,
  preview,
  text,
  tokens,
  error,
  editing,
  inputRef,
  onText,
  onOpen,
  onCommit,
  onCancel,
  symbolStrip,
}: {
  character: ResolvedCharacter;
  preview?: HpOutcome;
  text: string;
  tokens: HpToken[];
  error?: string;
  editing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onText: (value: string) => void;
  onOpen: () => void;
  onCommit: () => void;
  onCancel: () => void;
  symbolStrip?: boolean;
}): ReactNode {
  const sheet = useSheet();
  const current = preview?.current ?? character.hp.current;
  const temp = preview?.temp ?? character.hp.temp;
  const open = editing || Boolean(text);

  return (
    <div className="dg-hp-readout">
      <button
        type="button"
        className={preview ? "dg-hp-figure is-pending" : "dg-hp-figure"}
        onClick={onOpen}
        aria-label="Hit points"
        onContextMenu={(e) => {
          e.preventDefault();
          const explanation = explainStat(character.hp.max, { label: "Maximum hit points" });
          sheet.open({
            title: "Hit points",
            subtitle: `${character.hp.current} of ${character.hp.max.value + character.hp.tempMax}`,
            body: () => <TextBody formula={explanation.formula} text={CALC_HELP} />,
          });
        }}
      >
        <span className="dg-hp-current">{current}</span>
        {temp ? <span className="dg-hp-temp-text">+{temp}</span> : null}
      </button>

      {open ? (
        <div className="dg-hp-calc">
          <div className="dg-hp-calc-field">
            {/* The coloured copy sits under a transparent input, so what you type
             * is coloured by role without reimplementing a text editor. */}
            <span className="dg-hp-calc-ink" aria-hidden="true">
              {tokens.length ? inkOf(text, tokens) : <span className="dg-hp-token">{text}</span>}
            </span>
            <input
              ref={inputRef}
              className="dg-hp-calc-input"
              value={text}
              aria-label="Hit point entry"
              inputMode="text"
              spellCheck={false}
              onChange={(e) => onText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCommit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                }
              }}
              // Clicking away closes an empty box; one with text in it stays, so
              // the pending diff stays on screen with it.
              onBlur={() => {
                if (!text.trim()) onCancel();
              }}
            />
          </div>
          {symbolStrip ? (
            <div className="dg-hp-symbols">
              {SYMBOLS.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  className="dg-hp-symbol"
                  onClick={() => onText(text + (symbol === "−" ? "-" : symbol))}
                >
                  {symbol}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="dg-hp-calc-error">{error}</p> : null}
        </div>
      ) : (
        <button type="button" className="dg-hp-calc-open" onClick={onOpen} aria-label="Change hit points">
          <Icon name="plus-minus" />
          <span>+/−</span>
        </button>
      )}
    </div>
  );
}

/**
 * The coloured copy, character for character with what was typed.
 *
 * It sits under a transparent input and has to line up with the caret, so the
 * gaps between tokens are taken from the source text rather than assumed to be
 * one space. Reconstructing them put a trailing space after the last token that
 * the input does not have — invisible while the text was left-aligned, and a
 * character of drift on everything once it is set right.
 */
function inkOf(text: string, tokens: HpToken[]): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  for (const [i, token] of tokens.entries()) {
    if (token.at > at) out.push(<span key={`gap-${i}`}>{text.slice(at, token.at)}</span>);
    out.push(
      <span key={i} className={`dg-hp-token is-${token.role}`}>
        {token.text}
      </span>,
    );
    at = token.at + token.text.length;
  }
  if (at < text.length) out.push(<span key="tail">{text.slice(at)}</span>);
  return out;
}

const CALC_HELP = [
  "`-7` damage, temp HP first · `+3` heal · `-` or `+` one point",
  "`35` or `=35` set current · `+t4` `-t4` `=t4` temp HP",
  "`+m4` `-m4` `=m4` temporary maximum",
  "Tokens chain: `+m5 +5` commits as one entry.",
].join("\n\n");
