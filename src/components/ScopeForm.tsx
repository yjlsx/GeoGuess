import type { UserScope } from "../shared/types";

type Props = {
  value: UserScope;
  onChange: (value: UserScope) => void;
};

function update(value: UserScope, key: keyof UserScope, next: UserScope[keyof UserScope]): UserScope {
  return { ...value, [key]: next || undefined };
}

export function ScopeForm({ value, onChange }: Props) {
  const box = value.coordinateBox ?? { minLat: 28, minLon: 112, maxLat: 34, maxLon: 118 };
  const regionScope = value.regionScope ?? "custom";
  const boundaryMode = value.boundaryMode ?? "rectangle";

  function updateBox(key: keyof NonNullable<UserScope["coordinateBox"]>, next: string): UserScope {
    const parsed = Number(next);
    return {
      ...value,
      coordinateBox: {
        ...box,
        [key]: Number.isFinite(parsed) ? parsed : box[key]
      }
    };
  }

  return (
    <details className="panel workflow-panel scope-details" open>
      <summary className="section-heading compact-heading">
        <span className="step-number">3</span>
        <div>
          <h2>分析范围</h2>
        </div>
      </summary>
      <label className="field">
        区域范围
        <select value={regionScope} onChange={(event) => onChange(update(value, "regionScope", event.target.value))}>
          <option value="custom">自定义范围</option>
          <option value="global">全球</option>
          <option value="country">按国家/地区</option>
        </select>
      </label>
      {regionScope === "custom" ? (
        <>
          <div className="segment-control" aria-label="范围类型">
            <button className={boundaryMode === "rectangle" ? "active" : ""} type="button" onClick={() => onChange({ ...value, boundaryMode: "rectangle" })}>
              矩形范围
            </button>
            <button className={boundaryMode === "polygon" ? "active" : ""} type="button" onClick={() => onChange({ ...value, boundaryMode: "polygon" })}>
              多边形范围
            </button>
          </div>
          {boundaryMode === "rectangle" ? (
            <div className="scope-grid coordinate-box-grid">
              <label className="field">
                西
                <input value={box.minLon.toFixed(6)} onChange={(event) => onChange(updateBox("minLon", event.target.value))} />
              </label>
              <label className="field">
                东
                <input value={box.maxLon.toFixed(6)} onChange={(event) => onChange(updateBox("maxLon", event.target.value))} />
              </label>
              <label className="field">
                南
                <input value={box.minLat.toFixed(6)} onChange={(event) => onChange(updateBox("minLat", event.target.value))} />
              </label>
              <label className="field">
                北
                <input value={box.maxLat.toFixed(6)} onChange={(event) => onChange(updateBox("maxLat", event.target.value))} />
              </label>
            </div>
          ) : (
            <label className="field polygon-field">
              多边形坐标
              <textarea
                value={value.polygonCoordinates ?? ""}
                onChange={(event) => onChange(update(value, "polygonCoordinates", event.target.value))}
                placeholder="每行一个点：纬度, 经度"
              />
            </label>
          )}
        </>
      ) : null}
      {regionScope === "country" ? (
        <div className="scope-grid scope-extra-grid">
          <label className="field">
            国家/地区
            <input
              value={value.country ?? ""}
              onChange={(event) => onChange(update(value, "country", event.target.value))}
              placeholder="只知道国家也可以"
            />
          </label>
          <label className="field">
            省/州/城市（可选）
            <input
              value={value.region ?? ""}
              onChange={(event) => onChange(update(value, "region", event.target.value))}
              placeholder="不确定可留空"
            />
          </label>
          <label className="field">
            设施类型
            <input
              value={value.facilityType ?? ""}
              onChange={(event) => onChange(update(value, "facilityType", event.target.value))}
            />
          </label>
          <label className="field">
            来源
            <input value={value.source ?? ""} onChange={(event) => onChange(update(value, "source", event.target.value))} />
          </label>
          <label className="field scope-grid-wide">
            时间提示
            <input
              value={value.dateOrTimeHint ?? ""}
              onChange={(event) => onChange(update(value, "dateOrTimeHint", event.target.value))}
            />
          </label>
        </div>
      ) : null}
      {regionScope === "global" ? <p className="scope-mode-note">将在全球范围内生成候选位置，优先按视觉线索缩小范围。</p> : null}
      <label className="field scope-note-field">
        备注
        <textarea value={value.notes ?? ""} onChange={(event) => onChange(update(value, "notes", event.target.value))} />
      </label>
    </details>
  );
}
