import { useEffect, useState } from "react";

type Props = {
  files: File[];
  displayAssetName?: string | null;
  notes: string;
  onFileChange: (files: File[]) => void;
  onNotesChange: (notes: string) => void;
};

export function ImageInput({ files, displayAssetName = null, notes, onFileChange, onNotesChange }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const firstFile = files[0] ?? null;
  const displayedAssetName = firstFile?.name ?? displayAssetName;

  useEffect(() => {
    if (!firstFile || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(firstFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [firstFile]);

  return (
    <section className="panel workflow-panel">
      <div className="section-heading compact-heading">
        <span className="step-number">1</span>
        <div>
          <h2>上传与输入</h2>
        </div>
      </div>
      <label className="upload-dropzone">
        <span className="sr-only">上传图片</span>
        <input
          aria-label="上传图片"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(event) => onFileChange(Array.from(event.target.files ?? []))}
        />
        <span className="upload-icon" aria-hidden="true">⇧</span>
        <strong>点击或拖拽文件到此处</strong>
        <small>支持 JPG, PNG, WEBP, MP4, MOV<br />最大 200MB</small>
      </label>
      {displayedAssetName ? (
        <div className="asset-file-row">
          {previewUrl && firstFile?.type.startsWith("image/") ? (
            <img className="asset-thumb" src={previewUrl} alt="已选择图片预览" />
          ) : null}
          {previewUrl && firstFile?.type.startsWith("video/") ? <video className="asset-thumb" src={previewUrl} muted /> : null}
          {!previewUrl ? (
            <span className={firstFile?.type.startsWith("video/") ? "asset-thumb asset-thumb-placeholder video" : "asset-thumb asset-thumb-placeholder"}>
              {firstFile?.type.startsWith("video/") ? "MP4" : "IMG"}
            </span>
          ) : null}
          <div>
            <strong>{displayedAssetName}</strong>
            <span>
              {firstFile ? `${files.length} 个素材 / ${(firstFile.size / 1024 / 1024).toFixed(1)} MB` : "2024-05-16 17:45:32 | 2.6 MB"}
            </span>
          </div>
          {firstFile ? (
            <button type="button" aria-label="清除文件" onClick={() => onFileChange([])}>×</button>
          ) : (
            <span className="asset-row-static-close" aria-hidden="true">×</span>
          )}
        </div>
      ) : null}
      {files.length === 0 ? <p className="hint">可上传多张连续截图或一小段视频，系统会合并可见地物、站台、建筑、道路和视角线索。</p> : null}
      <label className="field">
        附加信息（可选）
        <textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="输入事件描述、来源链接、备注等..." />
      </label>
    </section>
  );
}
