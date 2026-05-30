import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../src/App";

describe("App", () => {
  it("renders the investigation workspace", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Image Geo Finder" })).toBeInTheDocument();
    expect(screen.getByLabelText("国家")).toBeInTheDocument();
    expect(screen.getByLabelText("OCR 文字")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeInTheDocument();
  });
});
