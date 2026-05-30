import type { UserScope } from "../shared/types";

type Props = {
  value: UserScope;
  onChange: (value: UserScope) => void;
};

function update(value: UserScope, key: keyof UserScope, next: string): UserScope {
  return { ...value, [key]: next || undefined };
}

export function ScopeForm({ value, onChange }: Props) {
  return (
    <section className="panel">
      <h2>已知范围</h2>
      <label className="field">
        国家
        <input value={value.country ?? ""} onChange={(event) => onChange(update(value, "country", event.target.value))} />
      </label>
      <label className="field">
        地区
        <input value={value.region ?? ""} onChange={(event) => onChange(update(value, "region", event.target.value))} />
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
      <label className="field">
        备注
        <textarea value={value.notes ?? ""} onChange={(event) => onChange(update(value, "notes", event.target.value))} />
      </label>
    </section>
  );
}
