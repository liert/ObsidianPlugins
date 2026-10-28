// @vitest-environment jsdom
import { Component } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enhanceMarkdownDiagrams, mountDiagram } from "../src/diagram";

let width = 416;
const components: Component[] = [];
const resizeCallbacks: (() => void)[] = [];
const disconnect = vi.fn();

beforeEach(() => {
  width = 416;
  resizeCallbacks.length = 0;
  disconnect.mockClear();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("te-graph") ? width : 0; });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(160);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resizeCallbacks.push(callback); }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => {
  components.splice(0).forEach(component => component.unload());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(mermaid = false) {
  const component = new Component();
  component.load();
  components.push(component);
  const host = document.body.appendChild(document.createElement("div"));
  if (mermaid) host.className = "mermaid";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 800 400");
  svg.setAttribute("width", "100%");
  host.appendChild(svg);
  return { component, host, svg };
}

function button(host: HTMLElement, label: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

function pointer(target: Element | Document, type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } });
  target.dispatchEvent(event);
}

function preparePan() {
  const diagram = setup();
  mountDiagram(diagram.svg, diagram.component);
  const viewport = diagram.host.querySelector<HTMLElement>(".te-graph")!;
  let captured: number | undefined;
  viewport.setPointerCapture = vi.fn((id: number) => { captured = id; });
  viewport.hasPointerCapture = vi.fn((id: number) => captured === id);
  viewport.releasePointerCapture = vi.fn(() => { captured = undefined; });
  return { ...diagram, viewport };
}

describe("diagram zoom in narrow panels", () => {
  it("fits on first display and scales both dimensions without distorting node coordinates", () => {
    const { svg, host, component } = setup();
    const clicked = vi.fn();
    svg.addEventListener("click", clicked);
    mountDiagram(svg, component);
    expect(svg.style.width).toBe("400px");
    expect(svg.style.height).toBe("200px");
    expect(host.querySelector(".te-graph-scale")?.textContent).toBe("50%");
    button(host, "放大流程图").click();
    expect(svg.style.width).toBe("480px");
    expect(svg.style.height).toBe("240px");
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 400");
    svg.dispatchEvent(new MouseEvent("click"));
    expect(clicked).toHaveBeenCalledOnce();
  });
  it("bounds zoom and restores 100% independently of fitting", () => {
    const { svg, host, component } = setup();
    mountDiagram(svg, component);
    const larger = button(host, "放大流程图");
    const smaller = button(host, "缩小流程图");
    for (let i = 0; i < 40; i++) larger.click();
    expect(host.querySelector(".te-graph-scale")?.textContent).toBe("300%");
    expect(larger.disabled).toBe(true);
    for (let i = 0; i < 80; i++) smaller.click();
    expect(host.querySelector(".te-graph-scale")?.textContent).toBe("5%");
    expect(smaller.disabled).toBe(true);
    button(host, "重置流程图为 100%").click();
    expect(svg.style.width).toBe("800px");
    expect(svg.style.height).toBe("400px");
  });
  it("adapts fit mode on resize but preserves a manually chosen scale", () => {
    const { svg, host, component } = setup();
    mountDiagram(svg, component);
    width = 216;
    resizeCallbacks[0]!();
    expect(svg.style.width).toBe("200px");
    button(host, "放大流程图").click();
    expect(svg.style.width).toBe("240px");
    width = 316;
    resizeCallbacks[0]!();
    expect(svg.style.width).toBe("240px");
    button(host, "缩放流程图以适应面板宽度").click();
    expect(svg.style.width).toBe("300px");
  });
  it("zooms with the wheel around the pointer without requiring a modifier key", () => {
    const { svg, host, component } = setup();
    mountDiagram(svg, component);
    const viewport = host.querySelector<HTMLElement>(".te-graph")!;
    const originalLeft = viewport.scrollLeft;
    const ordinary = new WheelEvent("wheel", { deltaY: -100, clientX: 100, cancelable: true });
    viewport.dispatchEvent(ordinary);
    expect(ordinary.defaultPrevented).toBe(true);
    expect(parseFloat(svg.style.width)).toBeCloseTo(440);
    expect(viewport.scrollLeft - originalLeft).toBeCloseTo(9.2);
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: 100, cancelable: true }));
    expect(parseFloat(svg.style.width)).toBeCloseTo(400);
  });
  it("supports keyboard zoom and removes observers and controls on component unload", () => {
    const { svg, host, component } = setup();
    mountDiagram(svg, component);
    const viewport = host.querySelector<HTMLElement>(".te-graph")!;
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(svg.style.width).toBe("480px");
    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true }));
    expect(svg.style.width).toBe("800px");
    component.unload();
    expect(disconnect).toHaveBeenCalledOnce();
    button(host, "缩小流程图").click();
    expect(svg.style.width).toBe("800px");
  });
  it("enhances Mermaid SVGs inserted later, without adding duplicate toolbars", async () => {
    const { svg, host, component } = setup(true);
    svg.remove();
    enhanceMarkdownDiagrams(host, component);
    host.appendChild(svg);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.querySelectorAll(".te-diagram")).toHaveLength(1);
    host.appendChild(document.createElement("span"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.querySelectorAll(".te-graph-controls")).toHaveLength(1);
    component.unload();
    const second = svg.cloneNode() as SVGSVGElement;
    host.appendChild(second);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.querySelectorAll(".te-diagram")).toHaveLength(1);
  });
  it("uses pixel dimensions for native SVGs and waits for valid Mermaid dimensions", async () => {
    const { svg, host, component } = setup();
    svg.removeAttribute("viewBox");
    mountDiagram(svg, component);
    expect(host.querySelector(".te-diagram")).toBeNull();
    svg.setAttribute("width", "800");
    svg.setAttribute("height", "400");
    mountDiagram(svg, component);
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 400");
    expect(svg.style.width).toBe("400px");
    const delayed = setup(true);
    delayed.svg.removeAttribute("viewBox");
    enhanceMarkdownDiagrams(delayed.host, delayed.component);
    expect(delayed.host.querySelector(".te-diagram")).toBeNull();
    delayed.svg.setAttribute("viewBox", "0 0 800 400");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(delayed.host.querySelector(".te-diagram")).not.toBeNull();
  });

  it("pans a fitted diagram with the left button, including outside the viewport", () => {
    const { svg, viewport } = preparePan();
    const left = viewport.scrollLeft;
    const top = viewport.scrollTop;
    pointer(svg, "pointerdown", 200, 80);
    pointer(document, "pointermove", 160, 50);
    expect(viewport.scrollLeft).toBe(left + 40);
    expect(viewport.scrollTop).toBe(top + 30);
    expect(viewport.classList.contains("is-panning")).toBe(true);
    pointer(document, "pointerup", 160, 50);
    pointer(document, "pointermove", 100, 10);
    expect(viewport.scrollLeft).toBe(left + 40);
    expect(viewport.classList.contains("is-panning")).toBe(false);
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("keeps node clicks and keyboard activation, but suppresses a click after dragging", () => {
    const { svg, viewport } = preparePan();
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(node);
    const click = vi.fn();
    node.addEventListener("click", click);
    pointer(node, "pointerdown", 100, 80);
    pointer(document, "pointermove", 101, 81);
    pointer(document, "pointerup", 101, 81);
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(click).toHaveBeenCalledOnce();
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();
    pointer(node, "pointerdown", 100, 80);
    pointer(document, "pointermove", 60, 50);
    pointer(document, "pointerup", 60, 50);
    const dragClick = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    node.dispatchEvent(dragClick);
    expect(dragClick.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("ends panning on cancellation or lost focus and releases capture on unload", () => {
    const { svg, viewport, component } = preparePan();
    for (const reason of ["pointercancel", "blur", "unload"]) {
      pointer(svg, "pointerdown", 100, 80);
      pointer(document, "pointermove", 80, 60);
      if (reason === "pointercancel") pointer(document, reason, 80, 60);
      else if (reason === "blur") window.dispatchEvent(new Event("blur"));
      else component.unload();
      const left = viewport.scrollLeft;
      pointer(document, "pointermove", 20, 10);
      expect(viewport.scrollLeft).toBe(left);
      expect(viewport.classList.contains("is-panning")).toBe(false);
    }
    expect(viewport.releasePointerCapture).toHaveBeenCalledTimes(3);
  });
});
