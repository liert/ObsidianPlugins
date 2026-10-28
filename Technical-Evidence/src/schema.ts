export interface EvidenceSection {
  title: string;
  kind: "markdown" | "code" | "data";
  content: string;
  language?: string;
  source?: string;
}

export interface CallNode {
  id: string;
  label: string;
  description?: string;
  code?: string;
  language?: string;
  source?: string;
}

export interface CallEdge {
  from: string;
  to: string;
  label?: string;
}

export interface EvidenceRecord {
  title: string;
  summary?: string;
  assessment?: EvidenceAssessment;
  parameters?: Record<string, string | number | boolean>;
  evidence?: EvidenceSection[];
  callChain?: { nodes: CallNode[]; edges: CallEdge[] };
}

function object(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} 必须是对象。`);
  return value as Record<string, unknown>;
}

function string(value: unknown, at: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${at} 必须是字符串。`);
}

function optionalStrings(value: Record<string, unknown>, keys: string[], at: string): void {
  for (const key of keys) if (value[key] !== undefined) string(value[key], `${at}.${key}`);
}

export function readRecord(json: string, id: string): EvidenceRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error("证据数据库不是有效的 JSON，请检查逗号、引号和括号。"); }
  const database = object(parsed, "数据库");
  if (database.version !== 1) throw new Error("证据数据库 version 必须为 1。");
  const records = object(database.records, "records");
  if (!id) throw new Error("JSON 证据链接需要 #条目ID，例如 evidence:Evidence/evidence.json#buffer-limit。");
  if (!Object.prototype.hasOwnProperty.call(records, id)) throw new Error(`数据库中找不到条目「${id}」。`);
  const record = object(records[id], `records.${id}`);
  string(record.title, "title");
  optionalStrings(record, ["summary"], id);
  if (record.assessment !== undefined) {
    const assessment = object(record.assessment, "assessment");
    if (!EVIDENCE_STATUSES.includes(assessment.status as EvidenceStatus)) throw new Error("assessment.status 必须是 confirmed、inferred、partial 或 unknown。");
    if (assessment.basis !== undefined && !EVIDENCE_BASES.includes(assessment.basis as typeof EVIDENCE_BASES[number])) throw new Error("assessment.basis 必须是 static、runtime、mixed 或 unverified。");
    optionalStrings(assessment, ["scope", "review"], "assessment");
    if (assessment.limitations !== undefined && (!Array.isArray(assessment.limitations) || !assessment.limitations.every(value => typeof value === "string"))) throw new Error("assessment.limitations 必须是字符串数组。");
  }
  if (record.parameters !== undefined) {
    const parameters = object(record.parameters, "parameters");
    for (const [name, value] of Object.entries(parameters)) {
      if (!["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
        throw new Error(`parameters.${name} 必须是字符串、有限数值或布尔值。`);
      }
    }
  }
  if (record.evidence !== undefined) {
    if (!Array.isArray(record.evidence)) throw new Error("evidence 必须是数组。");
    record.evidence.forEach((item, index) => {
      const section = object(item, `evidence[${index}]`);
      string(section.title, `evidence[${index}].title`);
      string(section.content, `evidence[${index}].content`);
      if (!["markdown", "code", "data"].includes(section.kind as string)) throw new Error(`evidence[${index}].kind 必须是 markdown、code 或 data。`);
      optionalStrings(section, ["language", "source"], `evidence[${index}]`);
    });
  }
  if (record.callChain !== undefined) {
    const chain = object(record.callChain, "callChain");
    if (!Array.isArray(chain.nodes) || !Array.isArray(chain.edges)) throw new Error("callChain 需要 nodes 和 edges 数组。");
    const ids = new Set<string>();
    chain.nodes.forEach((item, index) => {
      const node = object(item, `nodes[${index}]`);
      string(node.id, `nodes[${index}].id`);
      string(node.label, `nodes[${index}].label`);
      if (!node.id || ids.has(node.id)) throw new Error(`函数节点 ID 为空或重复：${node.id}`);
      ids.add(node.id);
      optionalStrings(node, ["description", "code", "language", "source"], `nodes[${index}]`);
    });
    chain.edges.forEach((item, index) => {
      const edge = object(item, `edges[${index}]`);
      string(edge.from, `edges[${index}].from`);
      string(edge.to, `edges[${index}].to`);
      optionalStrings(edge, ["label"], `edges[${index}]`);
      if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`调用边 ${edge.from} → ${edge.to} 引用了不存在的函数节点。`);
    });
  }
  if (!record.evidence && !record.callChain) throw new Error("条目至少需要 evidence 或 callChain。");
  return record as unknown as EvidenceRecord;
}
export const EVIDENCE_STATUSES = ["confirmed", "inferred", "partial", "unknown"] as const;
export type EvidenceStatus = typeof EVIDENCE_STATUSES[number];
export const EVIDENCE_BASES = ["static", "runtime", "mixed", "unverified"] as const;

export interface EvidenceAssessment {
  status: EvidenceStatus;
  basis?: typeof EVIDENCE_BASES[number];
  scope?: string;
  review?: string;
  limitations?: string[];
}

