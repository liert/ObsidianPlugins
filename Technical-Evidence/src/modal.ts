import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import { renderAssessment } from "./assessment";
import { fencedCode } from "./code";
import { enhanceMarkdownDiagrams, mountDiagram } from "./diagram";
import { FloatingPanel } from "./floating-panel";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "./graph";
import { bindPanelNavigation } from "./navigation";
import type { EvidenceKind, EvidenceReference } from "./reference";
import { EvidenceContent, EvidenceRepository } from "./repository";
import type { CallNode, EvidenceRecord } from "./schema";

let graphNumber = 0;

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

export class EvidenceModal extends FloatingPanel {
  private renderer = new Component();
  private activeTab: EvidenceKind;
  private generation = 0;
  private closed = false;
  private result?: EvidenceContent;
  private history: { reference: EvidenceReference; sourcePath: string; activeTab: EvidenceKind; scrollTop: number }[] = [];
  private restoreScrollTop = 0;

  constructor(app: App, private repository: EvidenceRepository, private reference: EvidenceReference, private sourcePath: string) {
    super(app);
    this.activeTab = reference.kind;
  }

  onOpen(): void {
    this.closed = false;
    this.modalEl.addClass("te-modal");
    this.setTitle(this.reference.kind === "callchain" ? "查看调用链" : "查看证据");
    void this.loadContent();
  }

  onClose(): void {
    this.closed = true;
    this.generation++;
    this.renderer.unload();
    this.contentEl.empty();
  }

  private reset(): void {
    this.renderer.unload();
    this.renderer = new Component();
    this.renderer.load();
    this.contentEl.empty();
  }

  private async loadContent(): Promise<void> {
    const generation = ++this.generation;
    this.reset();
    this.contentEl.createEl("p", { text: "正在加载证据…", cls: "te-loading", attr: { role: "status" } });
    try {
      const result = await this.repository.load(this.reference, this.sourcePath);
      if (this.closed || generation !== this.generation) return;
      this.result = result;
      await this.render();
      if (!this.closed && generation === this.generation) this.contentEl.scrollTop = this.restoreScrollTop;
    } catch (error) {
      if (this.closed || generation !== this.generation) return;
      this.reset();
      this.renderToolbar();
      const errorBox = this.contentEl.createDiv("te-error-card");
      errorBox.createEl("p", { text: error instanceof Error ? error.message : "读取证据失败。", cls: "te-error", attr: { role: "alert" } });
      errorBox.createEl("p", { text: `${this.reference.path || "默认数据库"}${this.reference.fragment ? `#${this.reference.fragment}` : ""}`, cls: "te-source" });
      errorBox.createEl("button", { text: "重试", cls: "te-retry-btn" }).addEventListener("click", () => { void this.loadContent(); });
    }
  }

  private async markdown(text: string, target: HTMLElement, component = this.renderer): Promise<void> {
    let cancelled = false;
    component.register(() => { cancelled = true; });
    const sourcePath = this.result!.path;
    bindPanelNavigation(this.app, target, sourcePath, component,
      reference => {
        this.history.push({ reference: this.reference, sourcePath: this.sourcePath, activeTab: this.activeTab, scrollTop: this.contentEl.scrollTop });
        this.reference = reference;
        this.sourcePath = sourcePath;
        this.activeTab = reference.kind;
        this.restoreScrollTop = 0;
        void this.loadContent();
      },
      error => new Notice(error instanceof Error ? error.message : "无法打开证据链接。"));
    await MarkdownRenderer.render(this.app, text, target, this.result!.path, component);
    if (!cancelled) enhanceMarkdownDiagrams(target, component);
  }

  private renderToolbar(path?: string): void {
    const toolbar = this.contentEl.createDiv("te-toolbar");
    if (this.history.length) {
      toolbar.createEl("button", { text: "← 返回", cls: "te-toolbar-btn te-back-btn", attr: { "aria-label": "返回上一条证据" } }).addEventListener("click", () => {
        const previous = this.history.pop()!;
        this.reference = previous.reference;
        this.sourcePath = previous.sourcePath;
        this.activeTab = previous.activeTab;
        this.restoreScrollTop = previous.scrollTop;
        void this.loadContent();
      });
    }
    toolbar.createEl("span", { text: (path ?? this.reference.path) || "默认数据库", cls: "te-source" });
    toolbar.createEl("button", { text: "刷新", cls: "te-toolbar-btn te-refresh-btn", attr: { "aria-label": "重新读取证据文件" } }).addEventListener("click", () => {
      this.restoreScrollTop = this.contentEl.scrollTop;
      void this.loadContent();
    });
  }

  private async render(): Promise<void> {
    const result = this.result!;
    this.reset();
    this.setTitle(result.type === "record" ? result.record.title : result.title);
    this.renderToolbar(result.path);
    if (result.type === "markdown") {
      const body = this.contentEl.createDiv({ cls: "te-markdown markdown-rendered" });
      await this.markdown(result.markdown, body);
      return;
    }
    const { record } = result;
    renderAssessment(this.contentEl, record.assessment);
    if (record.summary) this.contentEl.createEl("p", { text: record.summary, cls: "te-summary" });
    if (record.parameters && Object.keys(record.parameters).length) {
      const list = this.contentEl.createEl("dl", { cls: "te-parameters" });
      for (const [name, value] of Object.entries(record.parameters)) {
        list.createEl("dt", { text: name });
        list.createEl("dd", { text: String(value) });
      }
    }
    const tabs = this.contentEl.createDiv({ cls: "te-tabs", attr: { role: "tablist", "aria-label": "证据内容" } });
    const panelId = `te-panel-${++graphNumber}`;
    const panel = this.contentEl.createDiv({ cls: "te-panel", attr: { role: "tabpanel", id: panelId } });
    let tabRenderer = this.renderer.addChild(new Component());
    const buttons = new Map<EvidenceKind, HTMLButtonElement>();
    let tabGeneration = 0;
    const select = async (kind: EvidenceKind): Promise<void> => {
      const generation = ++tabGeneration;
      this.activeTab = kind;
      this.renderer.removeChild(tabRenderer);
      tabRenderer = this.renderer.addChild(new Component());
      for (const [key, button] of buttons) {
        button.setAttribute("aria-selected", String(key === kind));
        button.tabIndex = key === kind ? 0 : -1;
      }
      const button = buttons.get(kind)!;
      panel.setAttribute("aria-labelledby", button.id);
      panel.empty();
      const tabBody = panel.createDiv("markdown-rendered");
      try {
        if (kind === "callchain") await this.renderChain(record, tabBody, tabRenderer);
        else await this.renderEvidence(record, tabBody, tabRenderer);
      } catch (error) {
        if (generation === tabGeneration && !this.closed) tabBody.createEl("p", { text: error instanceof Error ? error.message : "渲染证据失败。", cls: "te-error" });
      }
    };
    for (const kind of ["evidence", "callchain"] as const) {
      const id = `te-tab-${++graphNumber}`;
      const button = tabs.createEl("button", { text: kind === "evidence" ? "结论依据" : "函数调用链", attr: { role: "tab", id, "aria-controls": panelId } });
      buttons.set(kind, button);
      button.addEventListener("click", () => { void select(kind); });
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next: EvidenceKind = event.key === "Home" ? "evidence" : event.key === "End" ? "callchain" : kind === "evidence" ? "callchain" : "evidence";
        buttons.get(next)!.focus();
        void select(next);
      });
    }
    await select(this.activeTab);
  }

  private async renderEvidence(record: EvidenceRecord, body: HTMLElement, component: Component): Promise<void> {
    let cancelled = false;
    component.register(() => { cancelled = true; });
    if (!record.evidence?.length) {
      body.createEl("p", { text: "此条目尚未附加结论依据。", cls: "te-empty" });
      return;
    }
    for (const section of record.evidence) {
      const element = body.createEl("section", { cls: "te-evidence-section" });
      element.createEl("h3", { text: section.title });
      if (section.source) element.createEl("p", { text: section.source, cls: "te-source" });
      const target = element.createDiv();
      await this.markdown(section.kind === "markdown" ? section.content : fencedCode(section.content, section.language ?? (section.kind === "data" ? "json" : "text")), target, component);
      if (this.closed || cancelled) return;
    }
  }

  private async renderChain(record: EvidenceRecord, body: HTMLElement, component: Component): Promise<void> {
    const chain = record.callChain;
    if (!chain?.nodes.length) {
      body.createEl("p", { text: "此条目尚未附加调用链。", cls: "te-empty" });
      return;
    }
    body.createEl("p", { text: "箭头表示调用方向。滚轮缩放，按住左键拖动；点击函数查看代码。", cls: "te-hint" });
    const graphContainer = body.createDiv("te-callgraph");
    const detail = body.createDiv("te-function-detail");
    let detailRenderer = component.addChild(new Component());
    const layout = layoutGraph(chain.nodes, chain.edges);
    const graph = svgElement("svg", { width: layout.width, height: layout.height, role: "group", "aria-label": "函数调用关系图" });
    graphContainer.appendChild(graph);
    const markerId = `te-arrow-${++graphNumber}`;
    const activeMarkerId = `${markerId}-active`;
    const defs = svgElement("defs");
    const marker = svgElement("marker", { id: markerId, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    marker.appendChild(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "te-arrow" }));
    const activeMarker = svgElement("marker", { id: activeMarkerId, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    activeMarker.appendChild(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "te-arrow te-arrow-active" }));
    defs.append(marker, activeMarker);
    graph.appendChild(defs);
    const positions = new Map(layout.nodes.map(node => [node.node.id, node]));
    const edgeElements: { from: string; to: string; path: SVGPathElement }[] = [];
    for (const edge of chain.edges) {
      const from = positions.get(edge.from)!;
      const to = positions.get(edge.to)!;
      let x1 = from.x + NODE_WIDTH;
      let y1 = from.y + NODE_HEIGHT / 2;
      let x2 = to.x;
      let y2 = to.y + NODE_HEIGHT / 2;
      let d: string;
      if (from === to) {
        x1 = from.x + NODE_WIDTH - 50;
        x2 = from.x + NODE_WIDTH - 15;
        y1 = y2 = from.y;
        d = `M ${x1} ${y1} C ${x1 - 35} ${y1 - 40}, ${x2 + 35} ${y2 - 40}, ${x2} ${y2}`;
      } else if (from.x === to.x) {
        x1 = x2 = from.x;
        const bend = from.x - (from.y < to.y ? 35 : 50);
        d = `M ${x1} ${y1} C ${bend} ${y1}, ${bend} ${y2}, ${x2} ${y2}`;
      } else {
        const middle = (x1 + x2) / 2;
        d = `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
      }
      const path = svgElement("path", { d, class: "te-edge", "marker-end": `url(#${markerId})` });
      const title = svgElement("title");
      title.textContent = `${from.node.label} → ${to.node.label}${edge.label ? `：${edge.label}` : ""}`;
      path.appendChild(title);
      graph.appendChild(path);
      edgeElements.push({ from: edge.from, to: edge.to, path });
    }
    const nodeElements = new Map<string, SVGGElement>();
    const selectNode = async (node: CallNode): Promise<void> => {
      for (const [id, element] of nodeElements) element.setAttribute("aria-pressed", String(id === node.id));
      for (const item of edgeElements) {
        const active = item.from === node.id || item.to === node.id;
        item.path.toggleAttribute("data-active", active);
        item.path.setAttribute("marker-end", `url(#${active ? activeMarkerId : markerId})`);
      }
      component.removeChild(detailRenderer);
      detailRenderer = component.addChild(new Component());
      detail.empty();
      const selected = detail.createDiv("te-function-card");
      selected.createEl("h3", { text: node.label });
      if (node.source) selected.createEl("p", { text: node.source, cls: "te-source" });
      if (node.description) selected.createEl("p", { text: node.description, cls: "te-function-desc" });
      const relationships = chain.edges.filter(edge => edge.from === node.id);
      if (relationships.length) {
        const list = selected.createEl("ul", { cls: "te-relations" });
        for (const edge of relationships) {
          const targetNode = positions.get(edge.to)!.node;
          const item = list.createEl("li");
          item.createEl("span", { text: "→ ", cls: "te-relation-arrow" });
          const jump = item.createEl("button", { text: targetNode.label, cls: "te-relation-link", attr: { type: "button" } });
          jump.addEventListener("click", () => { void selectNode(targetNode); });
          if (edge.label) item.createEl("span", { text: ` · ${edge.label}`, cls: "te-relation-label" });
        }
      }
      try {
        if (node.code !== undefined) await this.markdown(fencedCode(node.code, node.language), selected.createDiv(), detailRenderer);
        else selected.createEl("p", { text: "此函数尚未附加代码。", cls: "te-empty" });
      } catch (error) {
        if (!this.closed && selected.parentElement === detail) selected.createEl("p", { text: error instanceof Error ? error.message : "渲染函数代码失败。", cls: "te-error", attr: { role: "alert" } });
      }
    };
    for (const { node, x, y } of layout.nodes) {
      const element = svgElement("g", { class: "te-graph-node", transform: `translate(${x}, ${y})`, role: "button", tabindex: 0, "aria-label": node.label, "aria-pressed": "false" });
      element.appendChild(svgElement("rect", { width: NODE_WIDTH, height: NODE_HEIGHT, rx: 8 }));
      const title = svgElement("title");
      title.textContent = node.label;
      element.appendChild(title);
      const label = svgElement("text", { x: NODE_WIDTH / 2, y: NODE_HEIGHT / 2 + 4, "text-anchor": "middle" });
      const characters = Array.from(node.label);
      label.textContent = characters.length > 23 ? `${characters.slice(0, 22).join("")}…` : node.label;
      element.appendChild(label);
      element.addEventListener("click", () => { void selectNode(node); });
      element.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void selectNode(node);
      });
      graph.appendChild(element);
      nodeElements.set(node.id, element);
    }
    mountDiagram(graph, component);
    await selectNode(chain.nodes[0]!);
  }
}
