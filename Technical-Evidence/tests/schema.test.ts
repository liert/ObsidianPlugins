import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRecord } from "../src/schema";

const example = readFileSync(new URL("../examples/Evidence/evidence.json", import.meta.url), "utf8");
const database = (record: unknown) => JSON.stringify({ version: 1, records: { demo: record } });

describe("evidence database", () => {
  it("loads the complete sample, including code, data and call conditions", () => {
    const record = readRecord(example, "buffer-limit");
    expect(record.parameters?.["最大长度"]).toBe(4096);
    expect(record.evidence?.map(section => section.kind)).toEqual(["code", "code", "data", "markdown"]);
    expect(record.callChain?.edges[1]?.label).toBe("仅在检查通过后调用");
  });
  it("allows standalone evidence and standalone call chains", () => {
    expect(readRecord(database({ title: "Evidence", evidence: [] }), "demo").title).toBe("Evidence");
    expect(readRecord(database({ title: "Calls", callChain: { nodes: [], edges: [] } }), "demo").title).toBe("Calls");
  });
  it("reports malformed JSON, unsupported versions and missing IDs", () => {
    expect(() => readRecord("{", "demo")).toThrow("JSON");
    expect(() => readRecord('{"version":2,"records":{}}', "demo")).toThrow("version");
    expect(() => readRecord(example, "")).toThrow("#条目ID");
    expect(() => readRecord(example, "unknown")).toThrow("unknown");
    expect(() => readRecord(example, "toString")).toThrow("找不到");
  });
  it.each([
    { title: 12, evidence: [] },
    { title: "Bad", evidence: {} },
    { title: "Bad", evidence: [{ title: "Code", kind: "html", content: "test" }] },
    { title: "Bad", evidence: [{ title: "Code", kind: "code", content: 12 }] },
    { title: "Bad", evidence: [], parameters: { nested: { value: 1 } } },
    { title: "Bad", evidence: [], summary: false },
    { title: "Bad" }
  ])("rejects unusable records with a readable error", record => {
    expect(() => readRecord(database(record), "demo")).toThrow();
  });
  it("rejects duplicate nodes and dangling call edges", () => {
    expect(() => readRecord(database({ title: "Bad", callChain: { nodes: [{ id: "a", label: "a" }, { id: "a", label: "b" }], edges: [] } }), "demo")).toThrow("重复");
    expect(() => readRecord(database({ title: "Bad", callChain: { nodes: [{ id: "a", label: "a" }], edges: [{ from: "a", to: "missing" }] } }), "demo")).toThrow("不存在");
  });
  it("does not prevent reading one record because an unrelated record is malformed", () => {
    expect(readRecord(JSON.stringify({ version: 1, records: { good: { title: "Good", evidence: [] }, draft: null } }), "good").title).toBe("Good");
  });
  it("preserves explicit certainty, evidence basis and review boundaries", () => {
    const assessment = { status: "confirmed", basis: "static", scope: "单一版本", review: "本轮未重新核验", limitations: ["没有实机证据"] };
    expect(readRecord(database({ title: "Claim", evidence: [], assessment }), "demo").assessment).toEqual(assessment);
  });
  it.each([
    { status: "proven" },
    { status: "confirmed", basis: "live" },
    { status: "unknown", limitations: "not a list" },
    { status: "partial", limitations: [42] },
    { status: "inferred", review: true }
  ])("rejects invalid assessment metadata", assessment => {
    expect(() => readRecord(database({ title: "Claim", evidence: [], assessment }), "demo")).toThrow("assessment");
  });
});
