import { App, Component, MarkdownRenderer, MarkdownView, Notice } from "obsidian";
import { renderAssessment } from "./assessment";
import { fencedCode } from "./code";
import { enhanceMarkdownDiagrams, mountDiagram } from "./diagram";
import { FloatingPanel } from "./floating-panel";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "./graph";
import { LiveEvidenceEditor } from "./live-editor";
import { bindPanelNavigation } from "./navigation";
import type { EvidenceKind, EvidenceReference } from "./reference";
import { EvidenceContent, EvidenceRepository } from "./repository";
import { readEditableRecord, type CallNode, type EvidenceRecord } from "./schema";

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
  private draft?: { text: string; initial: string };
  private status?: HTMLElement;
  private discard?: HTMLButtonElement;
  private editing = false;
  private saving = false;
  private saveError = "";
  private saveTimer?: ReturnType<typeof setTimeout>;
  private savePromise?: Promise<void>;
  private pendingAction = 0;

  private get dirty(): boolean { return !!this.draft && this.draft.text !== this.draft.initial; }

  close(force = false): void {
    if (!force && (this.dirty || this.saving)) {
      this.afterSaved(() => super.close());
      return;
    }
    if (force && this.dirty) void this.save();
    super.close();
  }

  constructor(app: App, private repository: EvidenceRepository, private reference: EvidenceReference, private sourcePath: string) {
    super(app);
    this.activeTab = reference.kind;
  }

  onOpen(): void {
    this.closed = false;
    this.modalEl.addClass("te-modal");
    this.setTitle(this.reference.kind === "callchain" ? "查看调用链" : "查看证据");
    this.editing = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode() === "source";
    const syncMode = (): void => {
      const mode = this.app.workspace.getActiveViewOfType(MarkdownView)?.getMode();
      if (!mode || this.editing === (mode === "source")) return;
      this.editing = mode === "source";
      if (this.result) {
        this.refreshView();
        if (!this.editing) void this.flushSave();
      }
    };
    this.registerEvent(this.app.workspace.on("layout-change", syncMode));
    this.registerEvent(this.app.workspace.on("active-leaf-change", syncMode));
    this.registerEvent(this.app.workspace.on("file-open", syncMode));
    this.registerDomEvent(this.containerEl, "keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        void this.flushSave();
      }
    });
    void this.loadContent();
  }

  onClose(): void {
    this.closed = true;
    this.pendingAction++;
    this.clearSaveTimer();
    this.draft = undefined;
    this.generation++;
    this.renderer.unload();
    this.contentEl.empty();
  }

  private reset(): void {
    this.renderer.unload();
    this.renderer = new Component();
    this.renderer.load();
    this.contentEl.empty();
    this.status = undefined;
    this.discard = undefined;
  }

  private async loadContent(): Promise<void> {
    const generation = ++this.generation;
    this.result = undefined;
    this.draft = undefined;
    this.saveError = "";
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
      this.renderToolbar(this.result?.path);
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
    this.bindNavigation(target, sourcePath, component);
    await MarkdownRenderer.render(this.app, text, target, sourcePath, component);
    if (!cancelled) enhanceMarkdownDiagrams(target, component);
  }

  private bindNavigation(target: HTMLElement, sourcePath: string, component: Component): void {
    bindPanelNavigation(this.app, target, sourcePath, component,
      reference => {
        this.afterSaved(() => {
          this.history.push({ reference: this.reference, sourcePath: this.sourcePath, activeTab: this.activeTab, scrollTop: this.contentEl.scrollTop });
          this.reference = reference;
          this.sourcePath = sourcePath;
          this.activeTab = reference.kind;
          this.restoreScrollTop = 0;
          void this.loadContent();
        });
      },
      error => new Notice(error instanceof Error ? error.message : "无法打开证据链接。"));
  }

  private renderToolbar(path?: string): void {
    const toolbar = this.contentEl.createDiv("te-toolbar");
    if (this.history.length) {
      toolbar.createEl("button", { text: "← 返回", cls: "te-toolbar-btn te-back-btn", attr: { "aria-label": "返回上一条证据" } }).addEventListener("click", () => {
        this.afterSaved(() => {
          const previous = this.history.pop()!;
          this.reference = previous.reference;
          this.sourcePath = previous.sourcePath;
          this.activeTab = previous.activeTab;
          this.restoreScrollTop = previous.scrollTop;
          void this.loadContent();
        });
      });
    }
    toolbar.createEl("span", { text: (path ?? this.reference.path) || "默认数据库", cls: "te-source" });
    if (path) {
      toolbar.createEl("span", { text: this.editing ? "编辑 · 跟随正文" : "预览 · 跟随正文", cls: "te-mode-label" });
      const retry = toolbar.createEl("button", { text: "重试保存", cls: "te-toolbar-btn te-retry-save-btn" });
      retry.addEventListener("click", () => { void this.flushSave(); });
    }
    toolbar.createEl("button", { text: "刷新", cls: "te-toolbar-btn te-refresh-btn", attr: { "aria-label": "重新读取证据文件" } }).addEventListener("click", () => {
      this.afterSaved(() => {
        this.restoreScrollTop = this.contentEl.scrollTop;
        void this.loadContent();
      });
    });
    if (path) {
      this.status = this.contentEl.createDiv({ cls: "te-edit-status", attr: { role: "status", "aria-live": "polite" } });
      this.discard = this.contentEl.createEl("button", { text: "放弃未保存的修改", cls: "te-discard-btn" });
      this.discard.hidden = true;
      this.updateSaveStatus();
    }
  }

  private afterSaved(action: () => void): void {
    const pendingAction = ++this.pendingAction;
    if (!this.dirty && !this.saving) { action(); return; }
    void this.flushSave().then(saved => {
      if (this.closed || pendingAction !== this.pendingAction) return;
      if (saved) action();
      else if (this.discard) {
        this.discard.hidden = false;
        this.discard.onclick = () => {
          this.clearSaveTimer();
          this.draft = undefined;
          this.saveError = "";
          action();
        };
      }
    });
  }

  private refreshView(): void {
    const scrollTop = this.contentEl.scrollTop;
    const generation = this.generation;
    void this.render().then(() => {
      if (!this.closed && generation === this.generation) this.contentEl.scrollTop = scrollTop;
    }).catch(error => {
      if (!this.closed) new Notice(error instanceof Error ? error.message : "更新证据显示失败。");
    });
  }

  private changeDraft(text: string): void {
    this.draft!.text = text;
    this.saveError = "";
    if (this.discard) this.discard.hidden = true;
    this.scheduleSave();
  }

  private changeRecord(record: EvidenceRecord): void {
    this.changeDraft(JSON.stringify(record, null, 2));
  }

  private liveEditor(target: HTMLElement, text: string, label: string, component: Component, onChange: (text: string) => void, code = false): void {
    const host = target.createDiv("te-live-editor-host");
    this.bindNavigation(host, this.result!.path, component);
    component.addChild(new LiveEvidenceEditor(this.app, host, {
      path: this.result!.path, text, label, code, onChange,
      onBlur: () => { void this.flushSave(); }
    }));
  }

  private textField(target: HTMLElement, value: string | undefined, label: string, onChange: (text: string) => void): void {
    const input = target.createEl("input", { cls: "te-inline-field", attr: { type: "text", "aria-label": label, placeholder: label } });
    input.value = value ?? "";
    input.addEventListener("input", () => onChange(input.value));
    input.addEventListener("blur", () => { void this.flushSave(); });
  }

  private updateSaveStatus(): void {
    if (this.status) this.status.textContent = this.saving ? "正在自动保存…" : this.saveError || (this.dirty ? "等待自动保存…" : this.editing ? "已保存" : "");
    const retry = this.contentEl.querySelector<HTMLButtonElement>(".te-retry-save-btn");
    if (retry) {
      retry.hidden = !this.saveError;
      retry.disabled = this.saving;
    }
  }

  private clearSaveTimer(): void {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
  }

  private scheduleSave(): void {
    this.clearSaveTimer();
    if (this.dirty) this.saveTimer = setTimeout(() => { void this.save(); }, 500);
    this.updateSaveStatus();
  }

  private async flushSave(): Promise<boolean> {
    this.clearSaveTimer();
    while (!this.closed && (this.savePromise || this.dirty)) {
      await this.save();
      if (this.saveError) return false;
    }
    this.clearSaveTimer();
    return !this.closed;
  }

  private save(): Promise<void> {
    this.clearSaveTimer();
    if (this.savePromise) return this.savePromise;
    if (!this.dirty) return Promise.resolve();
    const draft = this.draft!;
    const text = draft.text;
    const generation = this.generation;
    this.saving = true;
    this.saveError = "";
    if (this.discard) this.discard.hidden = true;
    this.updateSaveStatus();
    this.savePromise = (async () => {
      try {
        const updated = await this.repository.save(this.result!, text);
        // Plugin unload can close the panel during a write; also flush any newer keystrokes.
        if (this.closed && draft.text !== text) await this.repository.save(updated, draft.text);
        if (this.closed || generation !== this.generation) return;
        this.result = updated;
        draft.initial = text;
        this.setTitle(updated.type === "record" ? updated.record.title : updated.title);
        if (!this.editing) this.refreshView();
      } catch (error) {
        const message = error instanceof Error ? error.message : "请重试。";
        if (this.closed) new Notice(`证据自动保存失败：${message}`);
        else this.saveError = `自动保存失败：${message}`;
      } finally {
        this.saving = false;
        this.savePromise = undefined;
        if (!this.closed) {
          this.updateSaveStatus();
          if (this.dirty && (this.draft !== draft || draft.text !== text)) this.scheduleSave();
        }
      }
    })();
    return this.savePromise;
  }

  private async render(): Promise<void> {
    let result = this.result!;
    this.reset();
    this.setTitle(result.type === "record" ? result.record.title : result.title);
    if (this.editing && !this.draft) {
      const text = result.type === "record" ? JSON.stringify(result.record, null, 2) : result.markdown;
      this.draft = { text, initial: text };
    }
    this.renderToolbar(result.path);
    if (this.editing && result.type === "markdown") {
      this.liveEditor(this.contentEl, this.draft!.text, "证据实时预览编辑器", this.renderer, text => this.changeDraft(text));
      return;
    }
    if (this.draft) {
      try {
        result = result.type === "markdown" ? { ...result, markdown: this.draft.text } : { ...result, record: readEditableRecord(this.draft.text) };
        this.setTitle(result.type === "record" ? result.record.title : result.title);
      } catch (error) {
        this.contentEl.createEl("p", { text: `${error instanceof Error ? error.message : "JSON 无效。"} 草稿已保留，请切回正文编辑模式修正。`, cls: "te-error", attr: { role: "alert" } });
        return;
      }
    }
    if (result.type === "markdown") {
      const body = this.contentEl.createDiv({ cls: "te-markdown markdown-rendered" });
      await this.markdown(result.markdown, body);
      return;
    }
    const { record } = result;
    if (this.editing) {
      this.textField(this.contentEl.createEl("h3", { cls: "te-record-title" }), record.title, "证据标题", text => { record.title = text; this.changeRecord(record); });
    }
    renderAssessment(this.contentEl, record.assessment);
    if (this.editing) {
      this.textField(this.contentEl.createEl("p", { cls: "te-summary" }), record.summary, "证据摘要", text => { record.summary = text; this.changeRecord(record); });
    } else if (record.summary) this.contentEl.createEl("p", { text: record.summary, cls: "te-summary" });
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
      const heading = element.createEl("h3", { text: this.editing ? "" : section.title });
      if (this.editing) {
        this.textField(heading, section.title, "证据段落标题", text => { section.title = text; this.changeRecord(record); });
        this.textField(element.createEl("p", { cls: "te-source" }), section.source, "证据来源", text => { section.source = text; this.changeRecord(record); });
      } else if (section.source) element.createEl("p", { text: section.source, cls: "te-source" });
      const target = element.createDiv();
      if (this.editing) {
        this.liveEditor(target, section.content, `${section.title}内容`, component, text => { section.content = text; this.changeRecord(record); }, section.kind !== "markdown");
      } else await this.markdown(section.kind === "markdown" ? section.content : fencedCode(section.content, section.language ?? (section.kind === "data" ? "json" : "text")), target, component);
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
      const heading = selected.createEl("h3", { text: this.editing ? "" : node.label });
      if (this.editing) {
        this.textField(heading, node.label, "函数名称", text => {
          node.label = text;
          const graphNode = nodeElements.get(node.id);
          const label = graphNode?.querySelector("text");
          if (label) label.textContent = text;
          graphNode?.setAttribute("aria-label", text);
          this.changeRecord(record);
        });
        this.textField(selected.createEl("p", { cls: "te-source" }), node.source, "函数来源", text => { node.source = text; this.changeRecord(record); });
        this.textField(selected.createEl("p", { cls: "te-function-desc" }), node.description, "函数说明", text => { node.description = text; this.changeRecord(record); });
      } else {
        if (node.source) selected.createEl("p", { text: node.source, cls: "te-source" });
        if (node.description) selected.createEl("p", { text: node.description, cls: "te-function-desc" });
      }
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
        if (this.editing) this.liveEditor(selected.createDiv(), node.code ?? "", `${node.label}代码`, detailRenderer, text => { node.code = text; this.changeRecord(record); }, true);
        else if (node.code !== undefined) await this.markdown(fencedCode(node.code, node.language), selected.createDiv(), detailRenderer);
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
