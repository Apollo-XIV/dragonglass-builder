---
name: convert-srd-wave
description: Run one wave of the SRD conversion plan by delegating to converter subagents and validating their output. Use when asked to convert a wave of the SRD, to run the SRD conversion, or when given SRD text to convert in bulk. Takes a wave number (0-3).
---

# Running one wave of the SRD conversion

You are the orchestrator. You **dispatch and verify**; you do not convert content yourself.

`docs/plan-srd-conversion.md` is the plan and this file is the loop around it. Read the plan
first — specifically the wave you were asked for, the id convention, and the acceptance
gate. Do not re-decide anything the plan has decided.

## Why you stay out of the content

Your value is that you stay light. Validation is a deterministic command, so you can verify
an entire wave without reading a single converted element. The moment you start reading
content to judge it, you lose the context budget that lets you run the whole wave — and you
duplicate the `srd-reviewer`, which does that job properly with fresh context per file.

So: **never open a converted JSON file to check it.** Run the commands and read the output.

## The loop

1. **Plan the units.** Read the wave's section in the plan and turn it into a list of units,
   one per subagent spawn. A unit is one file for spells and equipment, one class for
   classes. Create a task per unit with `TaskCreate` so the work is visible and survives a
   context summary.

2. **Dispatch.** Spawn the agent the plan's table names for that content:

   | Content | Agent |
   | --- | --- |
   | Spells | `srd-spell-converter` |
   | Weapons, armour, gear, magic items | `srd-item-converter` |
   | Species, backgrounds, feats | `srd-origin-converter` |
   | A class and its subclass | `srd-class-converter` |

   Each prompt must name: the exact content to convert, the exact file to write, where the
   SRD text for it is, and that it must not touch any other file. Give it the source text
   location rather than pasting the text.

   **Parallelism.** Spells and equipment: dispatch in batches of up to four, because they
   write disjoint files. **Classes: one at a time.** A class conversion is long, makes a
   hundred judgement calls, and its validation run would trip over another class's
   half-written files.

3. **Verify each unit, in this order.** All three must pass before the unit is done:

   ```sh
   npm run validate -- content/srd --strict   # 0 errors AND 0 warnings
   npm run typecheck
   npm test
   ```

   A **warning is a failure here.** `unknown-part` and the `levelsBy` hint both mean
   something will be silently ignored at runtime, which is the failure mode this whole plan
   is arranged to avoid.

4. **On failure, re-dispatch rather than fixing it yourself.** Send the agent back with the
   exact command output. It has the content in context and you do not. Fix it yourself only
   if it is a one-line mistake outside the content — a bad import in a test file, say — and
   say in your report that you did.

5. **Mark the task done** and move to the next unit.

## Stop and hand back when

- **The wave finishes.** Report and stop. Do not roll into the next wave: each wave is one
  session, and the task list is the handoff.
- **An agent reports something the schema could not express.** This is the most valuable
  output of the whole exercise. Collect it, finish the units that do not depend on it, and
  report it prominently. **Do not design a schema change yourself** — that is the
  checkpoint's job and the user's decision.
- **Wave 1 completes.** This is a hard stop. Spawn `srd-reviewer` once per converted class,
  collect the findings, and hand them to the user with your own summary. **A green test run
  is not the gate.** It proves the shape is right and says nothing about whether Rage's
  damage is wired to the right table column. You are not authorised to declare wave 1
  reviewed.
- **The same unit fails verification three times.** Stop dispatching, report what it keeps
  getting wrong. Something is wrong with the task, not with the attempt.

## Reporting

A subagent's final report is **not shown to the user**, so relay what matters: per unit, what
was converted, what was left as text, and anything the schema could not express. Keep a
running count. At the end, state plainly what passed, what is outstanding, and what needs a
decision before the next wave.
