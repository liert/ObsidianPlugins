// @vitest-environment jsdom
import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingPanel } from "../src/floating-panel";

const panels: FloatingPanel[] = [];
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 1440, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 1000, writable: true, configurable: true });
});
afterEach(() => {
  panels.splice(0).forEach(panel => panel.close());
  document.body.replaceChildren();
});

function createPanel() {
  const panel = new FloatingPanel({} as App);
  panels.push(panel);
  vi.spyOn(panel.containerEl, "getBoundingClientRect").mockImplementation(() => ({
    left: parseFloat(panel.containerEl.style.left) || 0,
    top: parseFloat(panel.containerEl.style.top) || 0,
    width: Math.min(parseFloat(panel.containerEl.style.width) || 440, window.innerWidth - 24),
    height: Math.min(parseFloat(panel.containerEl.style.height) || Math.min(760, window.innerHeight - 88), window.innerHeight - 24)
  } as DOMRect));
  const header = panel.containerEl.querySelector<HTMLElement>(".te-floating-header")!;
  for (const element of [header, ...Array.from(panel.containerEl.querySelectorAll<HTMLElement>(".te-resize-handle"))]) {
    let capture: number | undefined;
    element.setPointerCapture = vi.fn((id: number) => { capture = id; });
    element.hasPointerCapture = vi.fn((id: number) => capture === id);
    element.releasePointerCapture = vi.fn(() => { capture = undefined; });
  }
  const title = header.querySelector<HTMLElement>("h2")!;
  return { panel, header, title };
}

function pointer(element: Element, type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: true } });
  element.dispatchEvent(event);
}

describe("floating evidence panel", () => {
  it("starts on the right without a modal backdrop or global Escape handler", () => {
    const { panel } = createPanel();
    panel.open();
    expect(panel.containerEl.style.left).toBe("980px");
    expect(panel.containerEl.style.top).toBe("64px");
    expect(panel.containerEl.getAttribute("aria-modal")).toBe("false");
    expect(document.querySelector(".modal-bg")).toBeNull();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.click();
    expect(panel.containerEl.isConnected).toBe(true);
  });
  it("drags from the title bar and stops when the pointer is released", () => {
    const { panel, header } = createPanel();
    panel.open();
    pointer(header, "pointerdown", 1000, 80);
    pointer(header, "pointermove", 500, 200);
    expect(panel.containerEl.style.left).toBe("480px");
    expect(panel.containerEl.style.top).toBe("184px");
    pointer(header, "pointerup", 500, 200);
    pointer(header, "pointermove", 800, 300);
    expect(panel.containerEl.style.left).toBe("480px");
    expect(panel.containerEl.classList.contains("is-dragging")).toBe(false);
    expect(header.releasePointerCapture).toHaveBeenCalledWith(1);
  });
  it("keeps the entire panel within the viewport when dragged or resized", () => {
    const { panel, header } = createPanel();
    panel.open();
    pointer(header, "pointerdown", 1000, 80);
    pointer(header, "pointermove", -5000, -5000);
    expect(panel.containerEl.style.left).toBe("12px");
    expect(panel.containerEl.style.top).toBe("12px");
    pointer(header, "pointermove", 5000, 5000);
    expect(panel.containerEl.style.left).toBe("988px");
    expect(panel.containerEl.style.top).toBe("228px");
    Object.defineProperty(window, "innerWidth", { value: 800 });
    Object.defineProperty(window, "innerHeight", { value: 900 });
    window.dispatchEvent(new Event("resize"));
    expect(panel.containerEl.style.left).toBe("348px");
    expect(panel.containerEl.style.top).toBe("128px");
    expect(panel.containerEl.classList.contains("is-dragging")).toBe(false);
  });
  it("supports keyboard movement and closes on Escape inside the panel", () => {
    const { panel, title } = createPanel();
    panel.open();
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
    expect(panel.containerEl.style.left).toBe("960px");
    expect(panel.containerEl.style.top).toBe("68px");
    title.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.containerEl.isConnected).toBe(false);
  });
  it("restores opener focus on close, but keeps editor focus when reading outside", () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.focus();
    const { panel } = createPanel();
    panel.open();
    panel.close();
    expect(document.activeElement).toBe(opener);
    panel.open();
    const editor = document.body.appendChild(document.createElement("textarea"));
    editor.focus();
    panel.close();
    expect(document.activeElement).toBe(editor);
  });
  it("ignores dragging from the close button and cleans up capture and listeners", () => {
    const { panel, header } = createPanel();
    panel.open();
    const close = header.querySelector("button")!;
    pointer(close, "pointerdown", 1300, 80);
    expect(header.setPointerCapture).not.toHaveBeenCalled();
    pointer(header, "pointerdown", 1000, 80);
    pointer(header, "pointercancel", 1000, 80);
    expect(panel.containerEl.classList.contains("is-dragging")).toBe(false);
    pointer(header, "pointerdown", 1000, 80);
    close.click();
    const left = panel.containerEl.style.left;
    pointer(header, "pointermove", 500, 80);
    window.dispatchEvent(new Event("resize"));
    expect(panel.containerEl.style.left).toBe(left);
    expect(panel.containerEl.isConnected).toBe(false);
    expect(header.releasePointerCapture).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["n", 0, 100, 440, 660, 980, 164],
    ["s", 0, 100, 440, 860, 980, 64],
    ["w", -200, 0, 640, 760, 780, 64],
    ["e", -100, 0, 340, 760, 980, 64],
    ["nw", -200, 100, 640, 660, 780, 164],
    ["ne", -100, 100, 340, 660, 980, 164],
    ["sw", -200, 100, 640, 860, 780, 64],
    ["se", -100, 100, 340, 860, 980, 64]
  ])("resizes from the %s handle while keeping the opposite edges fixed", (direction, dx, dy, width, height, left, top) => {
    const { panel } = createPanel();
    panel.open();
    const handle = panel.containerEl.querySelector<HTMLElement>(`.te-resize-${direction}`)!;
    pointer(handle, "pointerdown", 1000, 100);
    pointer(handle, "pointermove", 1000 + Number(dx), 100 + Number(dy));
    expect(panel.containerEl.style.width).toBe(`${width}px`);
    expect(panel.containerEl.style.height).toBe(`${height}px`);
    expect(panel.containerEl.style.left).toBe(`${left}px`);
    expect(panel.containerEl.style.top).toBe(`${top}px`);
    pointer(handle, "pointerup", 1000 + Number(dx), 100 + Number(dy));
    pointer(handle, "pointermove", 0, 0);
    expect(panel.containerEl.style.width).toBe(`${width}px`);
    expect(panel.containerEl.classList.contains("is-resizing")).toBe(false);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("limits shrinking and expansion, and keeps a resized panel inside a smaller viewport", () => {
    const { panel } = createPanel();
    panel.open();
    const handle = panel.containerEl.querySelector<HTMLElement>(".te-resize-nw")!;
    pointer(handle, "pointerdown", 980, 64);
    pointer(handle, "pointermove", 5000, 5000);
    expect(panel.containerEl.style.width).toBe("320px");
    expect(panel.containerEl.style.height).toBe("240px");
    expect(panel.containerEl.style.left).toBe("1100px");
    expect(panel.containerEl.style.top).toBe("584px");
    pointer(handle, "pointermove", -5000, -5000);
    expect(panel.containerEl.style.width).toBe("1408px");
    expect(panel.containerEl.style.height).toBe("812px");
    expect(panel.containerEl.style.left).toBe("12px");
    expect(panel.containerEl.style.top).toBe("12px");
    window.innerWidth = 300;
    window.innerHeight = 220;
    window.dispatchEvent(new Event("resize"));
    expect(panel.containerEl.classList.contains("is-resizing")).toBe(false);
    const rect = panel.containerEl.getBoundingClientRect();
    expect(rect.left + rect.width).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(rect.top + rect.height).toBeLessThanOrEqual(window.innerHeight - 12);
  });

  it("expands toward the right and bottom only as far as the window permits", () => {
    const { panel } = createPanel();
    panel.open();
    const handle = panel.containerEl.querySelector<HTMLElement>(".te-resize-se")!;
    pointer(handle, "pointerdown", 1400, 800);
    pointer(handle, "pointermove", 5000, 5000);
    expect(panel.containerEl.style.width).toBe("448px");
    expect(panel.containerEl.style.height).toBe("924px");
    expect(panel.containerEl.style.left).toBe("980px");
    expect(panel.containerEl.style.top).toBe("64px");
  });

  it("keeps the opposite edge fixed when a short window cannot fit the normal minimum height", () => {
    window.innerWidth = 300;
    window.innerHeight = 220;
    const { panel } = createPanel();
    panel.open();
    const handle = panel.containerEl.querySelector<HTMLElement>(".te-resize-se")!;
    pointer(handle, "pointerdown", 280, 196);
    pointer(handle, "pointermove", 5000, 5000);
    expect(panel.containerEl.style.left).toBe("12px");
    expect(panel.containerEl.style.top).toBe("64px");
    expect(panel.containerEl.style.width).toBe("276px");
    expect(panel.containerEl.style.height).toBe("144px");
    pointer(handle, "pointerup", 5000, 5000);
    const north = panel.containerEl.querySelector<HTMLElement>(".te-resize-n")!;
    pointer(north, "pointerdown", 100, 64);
    pointer(north, "pointermove", 100, 5000);
    expect(panel.containerEl.style.top).toBe("12px");
    expect(panel.containerEl.style.height).toBe("196px");
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "close"])("ends resizing on %s and removes capture and listeners", reason => {
    const { panel } = createPanel();
    panel.open();
    const handle = panel.containerEl.querySelector<HTMLElement>(".te-resize-w")!;
    pointer(handle, "pointerdown", 980, 200);
    pointer(handle, "pointermove", 700, 200);
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    else if (reason === "close") panel.close();
    else pointer(handle, reason, 700, 200);
    pointer(handle, "pointermove", 600, 200);
    expect(panel.containerEl.style.width).toBe("720px");
    expect(panel.containerEl.classList.contains("is-resizing")).toBe(false);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("discards size after closing, including reopening the same instance and opening another panel", () => {
    const { panel, header } = createPanel();
    panel.open();
    const handle = panel.containerEl.querySelector<HTMLElement>(".te-resize-nw")!;
    pointer(handle, "pointerdown", 980, 64);
    pointer(handle, "pointermove", 700, 100);
    expect(panel.containerEl.style.width).toBe("720px");
    panel.close();
    panel.open();
    expect(panel.containerEl.style.width).toBe("");
    expect(panel.containerEl.style.height).toBe("");
    expect(panel.containerEl.getBoundingClientRect().width).toBe(440);
    expect(panel.containerEl.getBoundingClientRect().height).toBe(760);
    expect(panel.containerEl.style.left).toBe("980px");
    expect(panel.containerEl.style.top).toBe("64px");
    pointer(header, "pointerdown", 1000, 80);
    pointer(header, "pointermove", 500, 200);
    expect(panel.containerEl.style.left).toBe("480px");
    const other = createPanel().panel;
    other.open();
    expect(other.containerEl.getBoundingClientRect().width).toBe(440);
    expect(other.containerEl.getBoundingClientRect().height).toBe(760);
  });
});
