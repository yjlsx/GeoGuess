import type { Investigation } from "./types";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

/**
 * Minimal, dependency-free Markdown -> HTML conversion. Supports headings,
 * ordered/unordered lists, horizontal rules, paragraphs and inline
 * bold/italic/code. Good enough for rendering investigation reports for
 * print/PDF without pulling in a Markdown library.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(line)) {
      closeList();
      html.push("<hr />");
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    const unordered = /^[-*]\s+(.*)$/.exec(line);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  return html.join("\n");
}

function reportMarkdown(investigation: Investigation): string {
  const full = investigation.report?.fullMarkdown?.trim();
  if (full) {
    return full;
  }
  const summary = investigation.report?.summaryMarkdown?.trim();
  if (summary) {
    return summary;
  }
  return "本次调查暂无可导出的报告内容。";
}

export function reportTitle(investigation: Investigation): string {
  const best = investigation.candidates?.[0];
  if (best?.name) {
    return `GeoGuess 调查报告 · ${best.name}`;
  }
  return "GeoGuess 调查报告";
}

export function reportFileBase(investigation: Investigation): string {
  const asset = investigation.image?.originalPath?.split(/[\\/]/).pop() ?? "report";
  const base = asset.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
  return `GeoGuess_${base || "report"}`;
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportReportAsMarkdown(investigation: Investigation) {
  triggerDownload(`${reportFileBase(investigation)}.md`, reportMarkdown(investigation), "text/markdown;charset=utf-8");
}

function buildHtmlDocument(investigation: Investigation): string {
  const title = reportTitle(investigation);
  const body = markdownToHtml(reportMarkdown(investigation));
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 48px auto; max-width: 820px; padding: 0 24px; color: #0f172a; line-height: 1.7; }
  header.report-head { border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 28px; }
  header.report-head h1 { margin: 0 0 6px; font-size: 22px; }
  header.report-head .meta { color: #64748b; font-size: 13px; }
  h1, h2, h3, h4 { line-height: 1.3; }
  h1 { font-size: 20px; margin: 28px 0 12px; }
  h2 { font-size: 18px; margin: 24px 0 10px; }
  h3 { font-size: 16px; margin: 20px 0 8px; }
  h4 { font-size: 14px; margin: 16px 0 6px; color: #334155; }
  p { margin: 10px 0; }
  ul, ol { margin: 10px 0 10px 22px; }
  li { margin: 4px 0; }
  code { background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  @media print { body { margin: 0; padding: 0 12px; } }
</style>
</head>
<body>
<header class="report-head">
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">生成时间：${escapeHtml(generatedAt)}</div>
</header>
${body}
</body>
</html>`;
}

export function exportReportAsHtml(investigation: Investigation) {
  triggerDownload(`${reportFileBase(investigation)}.html`, buildHtmlDocument(investigation), "text/html;charset=utf-8");
}

export function printReport(investigation: Investigation): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return false;
  }
  printWindow.document.open();
  printWindow.document.write(buildHtmlDocument(investigation));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 350);
  return true;
}

export async function copyReportToClipboard(investigation: Investigation): Promise<boolean> {
  const text = reportMarkdown(investigation);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy copy path below
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
