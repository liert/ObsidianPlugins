import { describe, expect, it } from "vitest";
import { candidatePaths, inlineCodeText, inlineReferences, parseReference, vaultPath } from "../src/reference";

describe("vault references", () => {
  it("reads a JSON record and preserves case-sensitive IDs", () => {
    expect(parseReference("callchain:Evidence/db.json#BufferLimit")).toEqual({ kind: "callchain", path: "Evidence/db.json", fragment: "BufferLimit" });
  });
  it("decodes Unicode, spaces, literal hashes and percent signs once", () => {
    expect(parseReference("evidence:Evidence/%E8%AF%81%E6%8D%AE%20%231.md#%25value")).toEqual({ kind: "evidence", path: "Evidence/证据 #1.md", fragment: "%value" });
  });
  it("accepts default databases, whole files, headings and blocks", () => {
    expect(parseReference("evidence:#limit")?.path).toBe("");
    expect(parseReference("evidence:Evidence/proof.md")?.fragment).toBe("");
    expect(parseReference("evidence:Evidence/proof.md#^block")?.fragment).toBe("^block");
  });
  it("does not intercept ordinary links", () => {
    expect(parseReference("https://example.com")).toBeNull();
    expect(parseReference("Note.md#Heading")).toBeNull();
  });
  it.each(["evidence:C:/private.md", "evidence://server/proof.md", "evidence:folder%5Cfile.md", "evidence:%00file.md", "evidence:file.md?query=1", "evidence:bad%ZZ.md"])("rejects invalid or non-vault paths: %s", href => {
    expect(() => parseReference(href)).toThrow();
  });
  it("searches locally before the vault root", () => {
    expect(candidatePaths("Evidence/db.json", "Notes/Report.md", "Default.json")).toEqual(["Notes/Evidence/db.json", "Evidence/db.json"]);
  });
  it("honors explicit relative and root paths", () => {
    expect(candidatePaths("../Evidence/db.json", "Notes/Report.md", "Default.json")).toEqual(["Evidence/db.json"]);
    expect(candidatePaths("./proof.md", "Notes/Report.md", "Default.json")).toEqual(["Notes/proof.md"]);
    expect(candidatePaths("/Evidence/db.json", "Notes/Report.md", "Default.json")).toEqual(["Evidence/db.json"]);
    expect(candidatePaths("", "Notes/Report.md", "Evidence/default.json")).toEqual(["Evidence/default.json"]);
  });
  it("rejects escaping the vault", () => {
    expect(() => vaultPath("../../secret.md")).toThrow();
    expect(() => candidatePaths("../../secret.md", "Notes/Report.md", "db.json")).toThrow();
    expect(vaultPath("Evidence/temp/../proof.md")).toBe("Evidence/proof.md");
  });
});

describe("editor references", () => {
  it("recognizes whole code labels and preserves code span whitespace semantics", () => {
    expect(inlineCodeText("`G12_RCService`")).toBe("G12_RCService");
    expect(inlineCodeText("`` `name` ``")).toBe("`name`");
    expect(inlineCodeText("`   `")).toBe("   ");
    for (const label of ["plain", "prefix `code`", "`code` suffix", "``code`", "`one` and `two`", "``"]) {
      expect(inlineCodeText(label)).toBeNull();
    }
  });
  it("finds multiple buttons with accurate document ranges", () => {
    const text = "[查看证据](evidence:#one) · [查看调用链](callchain:db.json#one)";
    const references = inlineReferences(text, 10);
    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({ from: 10, label: "查看证据", href: "evidence:#one" });
    for (const reference of references) expect(text.slice(reference.from - 10, reference.to - 10)).toContain(reference.href);
  });
  it("supports angle-wrapped destinations with spaces", () => {
    expect(inlineReferences("[查看证据](<evidence:My Evidence.md#Length limit>)")[0]?.href).toBe("evidence:My Evidence.md#Length limit");
  });
  it("leaves images, escaped links and ordinary links alone", () => {
    expect(inlineReferences("![image](evidence:#one) \\[escaped](evidence:#two) [web](https://example.com)")).toHaveLength(0);
  });
});
