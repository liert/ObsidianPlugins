import type { EvidenceAssessment, EvidenceStatus } from "./schema";

const STATUS_LABELS: Record<EvidenceStatus, string> = {
  confirmed: "已确认", inferred: "推断", partial: "部分恢复", unknown: "未知"
};
const BASIS_LABELS = { static: "静态分析", runtime: "运行验证", mixed: "静态与运行证据", unverified: "未验证" };

/** No status is inferred from prose: omitted assessment stays omitted. */
export function renderAssessment(target: HTMLElement, assessment?: EvidenceAssessment): void {
  if (!assessment) return;
  const doc = target.ownerDocument;
  const section = doc.createElement("section");
  section.className = "te-assessment";
  section.setAttribute("aria-label", "证据等级与适用范围");
  const header = doc.createElement("div");
  header.className = "te-assessment-header";
  const badge = doc.createElement("span");
  badge.className = "te-assessment-status";
  badge.dataset.status = assessment.status;
  badge.textContent = `${STATUS_LABELS[assessment.status]} · ${assessment.status}`;
  header.appendChild(badge);
  if (assessment.basis) {
    const basis = doc.createElement("span");
    basis.className = "te-assessment-basis";
    basis.textContent = BASIS_LABELS[assessment.basis];
    header.appendChild(basis);
  }
  section.appendChild(header);
  const line = (label: string, value?: string, cls = "te-assessment-row"): void => {
    if (!value) return;
    const paragraph = doc.createElement("p");
    paragraph.className = cls;
    const strong = doc.createElement("strong");
    strong.className = "te-assessment-label";
    strong.textContent = `${label}：`;
    paragraph.append(strong, doc.createTextNode(value));
    section.appendChild(paragraph);
  };
  line("适用范围", assessment.scope);
  line("复核情况", assessment.review);
  if (assessment.status === "confirmed" && assessment.basis === "static") {
    line("说明", "静态证据已确认，不代表实机已经执行。", "te-assessment-row te-assessment-notice");
  }
  if (assessment.limitations?.length) {
    const group = doc.createElement("div");
    group.className = "te-assessment-limitations";
    const heading = doc.createElement("p");
    heading.className = "te-assessment-subheading";
    heading.textContent = "尚不能推出";
    group.appendChild(heading);
    const list = doc.createElement("ul");
    for (const limitation of assessment.limitations) {
      const item = doc.createElement("li");
      item.textContent = limitation;
      list.appendChild(item);
    }
    group.appendChild(list);
    section.appendChild(group);
  }
  target.appendChild(section);
}
