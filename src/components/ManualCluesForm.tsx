import type { ExtractedClues } from "../shared/types";

type Props = {
  value: ExtractedClues;
  onChange: (value: ExtractedClues) => void;
};

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(value: string[]) {
  return value.join("\n");
}

export function ManualCluesForm({ value, onChange }: Props) {
  function set(key: keyof ExtractedClues, next: string) {
    onChange({ ...value, [key]: splitLines(next) });
  }

  return (
    <section className="panel">
      <h2>手动线索</h2>
      <label className="field">
        OCR 文字
        <textarea value={joinLines(value.ocrText)} onChange={(event) => set("ocrText", event.target.value)} />
      </label>
      <label className="field">
        可见标识
        <textarea value={joinLines(value.visibleLabels)} onChange={(event) => set("visibleLabels", event.target.value)} />
      </label>
      <label className="field">
        地物特征
        <textarea value={joinLines(value.sceneFeatures)} onChange={(event) => set("sceneFeatures", event.target.value)} />
      </label>
      <label className="field">
        空间关系
        <textarea
          value={joinLines(value.spatialRelationships)}
          onChange={(event) => set("spatialRelationships", event.target.value)}
        />
      </label>
      <label className="field">
        搜索词
        <textarea
          value={joinLines(value.inferredSearchTerms)}
          onChange={(event) => set("inferredSearchTerms", event.target.value)}
        />
      </label>
    </section>
  );
}
