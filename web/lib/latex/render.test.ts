import { describe, expect, it } from "vitest";
import { escapeLatex } from "@/lib/latex/render";

describe("escapeLatex", () => {
  it("no toca texto plano sin caracteres especiales", () => {
    expect(escapeLatex("Ingeniero de Software")).toBe("Ingeniero de Software");
  });

  it.each([
    ["&", "\\&"],
    ["%", "\\%"],
    ["$", "\\$"],
    ["#", "\\#"],
    ["_", "\\_"],
    ["{", "\\{"],
    ["}", "\\}"],
  ])("escapa '%s' como '%s'", (input, expected) => {
    expect(escapeLatex(input)).toBe(expected);
  });

  it("escapa '\\\\' como \\textbackslash{} (no \\\\, que rompería LaTeX)", () => {
    expect(escapeLatex("\\")).toBe("\\textbackslash{}");
  });

  it("escapa '~' como \\textasciitilde{}", () => {
    expect(escapeLatex("~")).toBe("\\textasciitilde{}");
  });

  it("escapa '^' como \\textasciicircum{}", () => {
    expect(escapeLatex("^")).toBe("\\textasciicircum{}");
  });

  it("escapa varios caracteres especiales combinados en una sola cadena", () => {
    expect(escapeLatex("50% de C# & C++")).toBe("50\\% de C\\# \\& C++");
  });

  it("un salario/nota como '$3.000 USD' no rompe el documento", () => {
    expect(escapeLatex("$3.000 USD")).toBe("\\$3.000 USD");
  });
});
