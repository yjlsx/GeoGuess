import { useId, useMemo, useState } from "react";
import type { UserScope } from "../shared/types";

type Props = {
  value: UserScope;
  onChange: (value: UserScope) => void;
};

type CountryRegionOption = {
  name: string;
  aliases: string[];
};

const countryRegionOptions: CountryRegionOption[] = [
  { name: "中国", aliases: ["China", "CN", "PRC", "中国大陆", "Mainland China"] },
  { name: "中国香港", aliases: ["Hong Kong", "HK", "香港"] },
  { name: "中国澳门", aliases: ["Macau", "Macao", "MO", "澳门"] },
  { name: "中国台湾", aliases: ["Taiwan", "TW", "台湾"] },
  { name: "日本", aliases: ["Japan", "JP", "Nihon", "Nippon"] },
  { name: "韩国", aliases: ["South Korea", "Korea", "KR", "Republic of Korea"] },
  { name: "蒙古", aliases: ["Mongolia", "MN"] },
  { name: "印度", aliases: ["India", "IN"] },
  { name: "新加坡", aliases: ["Singapore", "SG"] },
  { name: "马来西亚", aliases: ["Malaysia", "MY"] },
  { name: "泰国", aliases: ["Thailand", "TH"] },
  { name: "越南", aliases: ["Vietnam", "VN"] },
  { name: "印度尼西亚", aliases: ["Indonesia", "ID"] },
  { name: "菲律宾", aliases: ["Philippines", "PH"] },
  { name: "柬埔寨", aliases: ["Cambodia", "KH"] },
  { name: "老挝", aliases: ["Laos", "LA"] },
  { name: "缅甸", aliases: ["Myanmar", "Burma", "MM"] },
  { name: "尼泊尔", aliases: ["Nepal", "NP"] },
  { name: "巴基斯坦", aliases: ["Pakistan", "PK"] },
  { name: "孟加拉国", aliases: ["Bangladesh", "BD"] },
  { name: "斯里兰卡", aliases: ["Sri Lanka", "LK"] },
  { name: "哈萨克斯坦", aliases: ["Kazakhstan", "KZ"] },
  { name: "吉尔吉斯斯坦", aliases: ["Kyrgyzstan", "KG"] },
  { name: "乌兹别克斯坦", aliases: ["Uzbekistan", "UZ"] },
  { name: "土库曼斯坦", aliases: ["Turkmenistan", "TM"] },
  { name: "塔吉克斯坦", aliases: ["Tajikistan", "TJ"] },
  { name: "俄罗斯", aliases: ["Russia", "Russian Federation", "RU"] },
  { name: "土耳其", aliases: ["Turkey", "Turkiye", "TR"] },
  { name: "阿联酋", aliases: ["United Arab Emirates", "UAE", "AE"] },
  { name: "沙特阿拉伯", aliases: ["Saudi Arabia", "SA"] },
  { name: "以色列", aliases: ["Israel", "IL"] },
  { name: "伊朗", aliases: ["Iran", "IR"] },
  { name: "伊拉克", aliases: ["Iraq", "IQ"] },
  { name: "约旦", aliases: ["Jordan", "JO"] },
  { name: "卡塔尔", aliases: ["Qatar", "QA"] },
  { name: "美国", aliases: ["United States", "USA", "US", "America"] },
  { name: "加拿大", aliases: ["Canada", "CA"] },
  { name: "墨西哥", aliases: ["Mexico", "MX"] },
  { name: "巴西", aliases: ["Brazil", "BR"] },
  { name: "阿根廷", aliases: ["Argentina", "AR"] },
  { name: "智利", aliases: ["Chile", "CL"] },
  { name: "秘鲁", aliases: ["Peru", "PE"] },
  { name: "哥伦比亚", aliases: ["Colombia", "CO"] },
  { name: "英国", aliases: ["United Kingdom", "UK", "Great Britain", "GB", "England"] },
  { name: "法国", aliases: ["France", "FR"] },
  { name: "德国", aliases: ["Germany", "DE"] },
  { name: "意大利", aliases: ["Italy", "IT"] },
  { name: "西班牙", aliases: ["Spain", "ES"] },
  { name: "葡萄牙", aliases: ["Portugal", "PT"] },
  { name: "荷兰", aliases: ["Netherlands", "Holland", "NL"] },
  { name: "比利时", aliases: ["Belgium", "BE"] },
  { name: "瑞士", aliases: ["Switzerland", "CH"] },
  { name: "奥地利", aliases: ["Austria", "AT"] },
  { name: "瑞典", aliases: ["Sweden", "SE"] },
  { name: "挪威", aliases: ["Norway", "NO"] },
  { name: "丹麦", aliases: ["Denmark", "DK"] },
  { name: "芬兰", aliases: ["Finland", "FI"] },
  { name: "冰岛", aliases: ["Iceland", "IS"] },
  { name: "爱尔兰", aliases: ["Ireland", "IE"] },
  { name: "波兰", aliases: ["Poland", "PL"] },
  { name: "捷克", aliases: ["Czechia", "Czech Republic", "CZ"] },
  { name: "匈牙利", aliases: ["Hungary", "HU"] },
  { name: "罗马尼亚", aliases: ["Romania", "RO"] },
  { name: "保加利亚", aliases: ["Bulgaria", "BG"] },
  { name: "希腊", aliases: ["Greece", "GR"] },
  { name: "乌克兰", aliases: ["Ukraine", "UA"] },
  { name: "白俄罗斯", aliases: ["Belarus", "BY"] },
  { name: "塞尔维亚", aliases: ["Serbia", "RS"] },
  { name: "克罗地亚", aliases: ["Croatia", "HR"] },
  { name: "澳大利亚", aliases: ["Australia", "AU"] },
  { name: "新西兰", aliases: ["New Zealand", "NZ"] },
  { name: "南非", aliases: ["South Africa", "ZA"] },
  { name: "埃及", aliases: ["Egypt", "EG"] },
  { name: "摩洛哥", aliases: ["Morocco", "MA"] },
  { name: "肯尼亚", aliases: ["Kenya", "KE"] },
  { name: "埃塞俄比亚", aliases: ["Ethiopia", "ET"] },
  { name: "尼日利亚", aliases: ["Nigeria", "NG"] }
];

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s_/.,()-]+/g, "");
}

function update(value: UserScope, key: keyof UserScope, next: UserScope[keyof UserScope]): UserScope {
  return { ...value, [key]: next || undefined };
}

function CountryRegionCombobox({
  value,
  onChange,
  onOpenChange
}: {
  value: string;
  onChange: (next: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const inputId = useId();
  const listboxId = useId();
  const [open, setOpenState] = useState(false);
  const filteredOptions = useMemo(() => {
    const query = normalizeSearchText(value);
    if (!query) {
      return countryRegionOptions.slice(0, 10);
    }

    return countryRegionOptions
      .filter((option) => {
        const searchTarget = normalizeSearchText([option.name, ...option.aliases].join(" "));
        return searchTarget.includes(query);
      })
      .slice(0, 10);
  }, [value]);

  function setOpen(next: boolean) {
    setOpenState(next);
    onOpenChange(next);
  }

  function choose(option: CountryRegionOption) {
    onChange(option.name);
    setOpen(false);
  }

  return (
    <label className="field country-combobox-field" htmlFor={inputId}>
      国家/地区
      <div className={open ? "country-combobox open" : "country-combobox"}>
        <input
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          autoComplete="off"
          id={inputId}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
            if (event.key === "Enter" && open && filteredOptions[0]) {
              event.preventDefault();
              choose(filteredOptions[0]);
            }
          }}
          placeholder="搜索或选择国家/地区"
          role="combobox"
          value={value}
        />
        <button
          aria-label={open ? "收起国家/地区选择" : "展开国家/地区选择"}
          className="country-combobox-toggle"
          onClick={() => setOpen(!open)}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          ▾
        </button>
        {open ? (
          <div className="country-combobox-menu" id={listboxId} role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  aria-selected={option.name === value}
                  className={option.name === value ? "selected" : ""}
                  key={option.name}
                  onClick={() => choose(option)}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                  type="button"
                >
                  <strong>{option.name}</strong>
                  <span>{option.aliases.slice(0, 3).join(" · ")}</span>
                </button>
              ))
            ) : (
              <div className="country-combobox-empty">未匹配，可直接输入</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function ScopeForm({ value, onChange }: Props) {
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const box = value.coordinateBox ?? { minLat: 28, minLon: 112, maxLat: 34, maxLon: 118 };
  const regionScope = value.regionScope ?? "country";
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
    <details className={countryPickerOpen ? "panel workflow-panel scope-details country-picker-open" : "panel workflow-panel scope-details"} open>
      <summary className="section-heading compact-heading">
        <span className="step-number">2</span>
        <div>
          <h2>分析范围</h2>
        </div>
      </summary>
      <label className="field">
        区域范围
        <select value={regionScope} onChange={(event) => onChange(update(value, "regionScope", event.target.value))}>
          <option value="country">按国家/地区</option>
          <option value="custom">自定义范围</option>
          <option value="global">全球</option>
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
          <CountryRegionCombobox
            value={value.country ?? ""}
            onChange={(next) => onChange(update(value, "country", next))}
            onOpenChange={setCountryPickerOpen}
          />
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
