import type { Component } from "obsidian";

const MIN_SCALE = 0.05;
const MAX_SCALE = 3;

function dimensions(svg: SVGSVGElement): { width: number; height: number } | null {
  const box = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
    return { width: box[2]!, height: box[3]! };
  }
  const width = svg.getAttribute("width") ?? "";
  const height = svg.getAttribute("height") ?? "";
  if (!/^\d+(?:\.\d+)?(?:px)?$/.test(width) || !/^\d+(?:\.\d+)?(?:px)?$/.test(height)) return null;
  const size = { width: parseFloat(width), height: parseFloat(height) };
  return size.width > 0 && size.height > 0 ? size : null;
}

/** Resize the SVG viewport as well as its drawing, so scrollbars match the zoom. */
export function mountDiagram(svg: SVGSVGElement, component: Component): void {
  if (svg.closest(".te-diagram")) return;
  const size = dimensions(svg);
  const parent = svg.parentElement;
  if (!size || !parent) return;
  const doc = svg.ownerDocument;
  const win = doc.defaultView!;
  const shell = doc.createElement("div");
  shell.className = "te-diagram";
  parent.insertBefore(shell, svg);
  const controls = doc.createElement("div");
  controls.className = "te-graph-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "流程图缩放");
  const viewport = doc.createElement("div");
  viewport.className = "te-graph";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "region");
  viewport.setAttribute("aria-label", "流程图，滚轮缩放，按住左键拖动；加减键缩放，0 重置");
  const stage = doc.createElement("div");
  stage.className = "te-graph-stage";
  viewport.appendChild(stage);
  stage.appendChild(svg);
  shell.append(controls, viewport);
  if (!svg.hasAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  let scale = 1;
  let fitMode = true;
  let gutterX = 0;
  let gutterY = 0;
  const button = (text: string, label: string): HTMLButtonElement => {
    const element = doc.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.setAttribute("aria-label", label);
    element.title = label;
    controls.appendChild(element);
    return element;
  };
  const smaller = button("−", "缩小流程图");
  const percentage = doc.createElement("span");
  percentage.className = "te-graph-scale";
  percentage.setAttribute("role", "status");
  percentage.setAttribute("aria-live", "polite");
  controls.appendChild(percentage);
  const larger = button("+", "放大流程图");
  const fit = button("适应宽度", "缩放流程图以适应面板宽度");
  const reset = button("重置", "重置流程图为 100%");

  const setScale = (value: number, anchorX = viewport.clientWidth / 2, anchorY = viewport.clientHeight / 2): void => {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
    const x = (viewport.scrollLeft + anchorX - gutterX - 8) / scale;
    const y = (viewport.scrollTop + anchorY - gutterY - 8) / scale;
    // Leave room on every side so a fitted or small diagram can also be panned.
    gutterX = viewport.clientWidth;
    gutterY = viewport.clientHeight;
    stage.style.padding = `${gutterY + 8}px ${gutterX + 8}px`;
    scale = next;
    svg.setAttribute("width", String(size.width * scale));
    svg.setAttribute("height", String(size.height * scale));
    svg.style.width = `${size.width * scale}px`;
    svg.style.height = `${size.height * scale}px`;
    viewport.scrollLeft = Math.max(0, x * scale + gutterX + 8 - anchorX);
    viewport.scrollTop = Math.max(0, y * scale + gutterY + 8 - anchorY);
    percentage.textContent = `${Math.round(scale * 100)}%`;
    smaller.disabled = scale <= MIN_SCALE;
    larger.disabled = scale >= MAX_SCALE;
    fit.setAttribute("aria-pressed", String(fitMode));
  };
  const fitWidth = (): void => {
    fitMode = true;
    // Hidden sections have no width yet; ResizeObserver retries after they appear.
    if (viewport.clientWidth > 16) setScale(Math.min(1, (viewport.clientWidth - 16) / size.width));
    else setScale(scale);
    viewport.scrollLeft = gutterX;
    viewport.scrollTop = gutterY;
  };
  const zoom = (factor: number, x?: number, y?: number): void => {
    fitMode = false;
    setScale(scale * factor, x, y);
  };
  const resetZoom = (): void => {
    fitMode = false;
    setScale(1);
    viewport.scrollLeft = gutterX;
    viewport.scrollTop = gutterY;
  };
  component.registerDomEvent(smaller, "click", () => zoom(1 / 1.2));
  component.registerDomEvent(larger, "click", () => zoom(1.2));
  component.registerDomEvent(fit, "click", fitWidth);
  component.registerDomEvent(reset, "click", resetZoom);
  component.registerDomEvent(viewport, "wheel", event => {
    if (!event.deltaY) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = viewport.getBoundingClientRect();
    zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  let drag: { pointer: number; x: number; y: number; left: number; top: number; moving: boolean } | undefined;
  let suppressClick = false;
  let clickTimer: number | undefined;
  const finishPan = (suppress = false): void => {
    const previous = drag;
    drag = undefined;
    viewport.classList.remove("is-panning");
    if (previous && viewport.hasPointerCapture(previous.pointer)) viewport.releasePointerCapture(previous.pointer);
    suppressClick = suppress && previous?.moving === true;
    if (clickTimer !== undefined) win.clearTimeout(clickTimer);
    clickTimer = suppressClick ? win.setTimeout(() => { suppressClick = false; clickTimer = undefined; }, 0) : undefined;
  };
  component.registerDomEvent(viewport, "pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    finishPan();
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moving: false };
  });
  component.registerDomEvent(doc, "pointermove", event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) < 4) return;
    if (!drag.moving) {
      drag.moving = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-panning");
      fitMode = false;
      fit.setAttribute("aria-pressed", "false");
    }
    event.preventDefault();
    viewport.scrollLeft = Math.max(0, drag.left - dx);
    viewport.scrollTop = Math.max(0, drag.top - dy);
  }, { passive: false });
  component.registerDomEvent(doc, "pointerup", event => {
    if (drag?.pointer === event.pointerId) finishPan(true);
  });
  component.registerDomEvent(doc, "pointercancel", event => {
    if (drag?.pointer === event.pointerId) finishPan();
  });
  component.registerDomEvent(viewport, "lostpointercapture", event => {
    if (drag?.pointer === event.pointerId) finishPan();
  });
  component.registerDomEvent(viewport, "click", event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, { capture: true });
  component.registerDomEvent(viewport, "dragstart", event => event.preventDefault());
  component.registerDomEvent(win, "blur", () => finishPan());
  component.register(() => finishPan());
  component.registerDomEvent(viewport, "keydown", event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!["+", "=", "-", "0"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "0") resetZoom();
    else zoom(event.key === "-" ? 1 / 1.2 : 1.2);
  });
  if (win.ResizeObserver) {
    const observer = new win.ResizeObserver(() => { if (fitMode) fitWidth(); else setScale(scale); });
    observer.observe(viewport);
    component.register(() => observer.disconnect());
  } else component.registerDomEvent(win, "resize", () => { if (fitMode) fitWidth(); else setScale(scale); });
  fitWidth();
}

/** Mermaid may insert its SVG after MarkdownRenderer has resolved. */
export function enhanceMarkdownDiagrams(target: HTMLElement, component: Component): void {
  const enhance = (): void => {
    for (const svg of Array.from(target.querySelectorAll<SVGSVGElement>(".mermaid svg, .block-language-mermaid svg"))) mountDiagram(svg, component);
  };
  enhance();
  const observer = new target.ownerDocument.defaultView!.MutationObserver(enhance);
  observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["viewBox", "width", "height"] });
  component.register(() => observer.disconnect());
}
