import type { CropMode } from "../shared/types";

type Props = {
  file: File | null;
  cropMode: CropMode;
  onFileChange: (file: File | null) => void;
  onCropModeChange: (mode: CropMode) => void;
};

export function ImageInput({ file, cropMode, onFileChange, onCropModeChange }: Props) {
  return (
    <section className="panel">
      <h2>图片</h2>
      <label className="field">
        上传图片
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </label>
      {file ? <p className="hint">已选择：{file.name}</p> : <p className="hint">支持截图、裁切图和视频帧。</p>}
      <label className="field">
        分析区域
        <select value={cropMode} onChange={(event) => onCropModeChange(event.target.value as CropMode)}>
          <option value="upper_half">上半张</option>
          <option value="full">整张</option>
          <option value="manual" disabled>
            手动框选（后续增强）
          </option>
        </select>
      </label>
    </section>
  );
}
