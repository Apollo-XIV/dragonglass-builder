/**
 * What a class or subclass brings, level by level, or a species its traits, so it can
 * be read before it is picked. Each feature folds open to its text; the text is only rendered once open,
 * since a class can name thirty features.
 */

import { useState, type ReactNode } from "react";
import type { ElementPreview, PreviewFeature } from "../../core/content/preview";
import { Markdown } from "./components";

function FeatureFold({ feature }: { feature: PreviewFeature }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <details className="dg-preview-feature" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{feature.name}</summary>
      {open ? (
        <div className="dg-preview-body">
          {feature.text ? <Markdown source={feature.text} /> : null}
          {feature.spells.length ? <p className="dg-muted">Spells: {feature.spells.join(", ")}</p> : null}
          {feature.children.map((child) => (
            <FeatureFold key={child.id} feature={child} />
          ))}
          {!feature.text && !feature.spells.length && !feature.children.length ? (
            <p className="dg-muted">No rules text.</p>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

export function LevelPreview({ preview }: { preview?: ElementPreview }): ReactNode {
  if (!preview?.levels.length) return null;
  return (
    <div className="dg-preview">
      {preview.levels.map((row) => (
        <section className="dg-preview-level" key={row.level ?? "all"}>
          {row.level === undefined ? null : <h4>Level {row.level}</h4>}
          {row.features.map((feature) => (
            <FeatureFold key={feature.id} feature={feature} />
          ))}
          {row.choices.map((choice, i) => (
            <p className="dg-preview-line" key={`c${i}`}>
              <span className="dg-muted">Choose</span> {choice}
            </p>
          ))}
          {row.spells.length ? (
            <p className="dg-preview-line">
              <span className="dg-muted">Spells</span> {row.spells.join(", ")}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
