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
  const badge = doc.createElement("span");
  badge.className = "te-assessment-status";
  badge.dataset.status = assessment.status;
  badge.textContent = `${STATUS_LABELS[assessment.status]} · ${assessment.status}`;
  section.appendChild(badge);
  if (assessment.basis) {
    const basis = doc.createElement("span");
    basis.className = "te-assessment-basis";
    basis.textContent = BASIS_LABELS[assessment.basis];
    section.appendChild(basis);
  }
  const line = (label: string, value?: string): void => {
    if (!value) return;
    const paragraph = doc.createElement("p");
    paragraph.textContent = `${label}：${value}`;
    section.appendChild(paragraph);
  };
  line("适用范围", assessment.scope);
  line("复核情况", assessment.review);
  if (assessment.status === "confirmed" && assessment.basis === "static") line("说明", "静态证据已确认，不代表实机已经执行。");
  if (assessment.limitations?.length) {
    const heading = doc.createElement("p");
    heading.textContent = "尚不能推出";
    section.appendChild(heading);
    const list = doc.createElement("ul");
    for (const limitation of assessment.limitations) {
      const item = doc.createElement("li");
      item.textContent = limitation;
      list.appendChild(item);
    }
    section.appendChild(list);
  }
  target.appendChild(section);
}
