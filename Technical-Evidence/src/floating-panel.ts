import { App, Component } from "obsidian";

let panelNumber = 0;
let panelLayer = 100;

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** A non-modal surface: no backdrop, focus trap, or global keyboard scope. */
export class FloatingPanel extends Component {
  readonly containerEl: HTMLElement;
  readonly modalEl: HTMLElement;
  readonly contentEl: HTMLElement;
  private readonly headerEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly resizeHandles: { element: HTMLElement; direction: ResizeDirection }[] = [];
  private opened = false;
  private moved = false;
  private previousFocus: HTMLElement | null = null;
  private drag?: { pointer: number; x: number; y: number; left: number; top: number };
  private resizing?: { pointer: number; x: number; y: number; left: number; top: number; width: number; height: number; direction: ResizeDirection; handle: HTMLElement };

  constructor(readonly app: App) {
    super();
    const doc = document;
    const id = `te-floating-title-${++panelNumber}`;
    this.containerEl = doc.createElement("div");
    this.modalEl = this.containerEl;
    this.containerEl.className = "te-floating-panel";
    this.containerEl.setAttribute("role", "dialog");
    this.containerEl.setAttribute("aria-modal", "false");
    this.containerEl.setAttribute("aria-labelledby", id);
    this.headerEl = doc.createElement("div");
    this.headerEl.className = "te-floating-header";
    this.titleEl = doc.createElement("h2");
    this.titleEl.id = id;
    this.titleEl.className = "te-floating-title";
    this.titleEl.tabIndex = 0;
    this.titleEl.title = "拖动标题栏移动面板，也可聚焦标题后按方向键移动";
    this.closeButton = doc.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "te-floating-close";
    this.closeButton.textContent = "×";
    this.closeButton.setAttribute("aria-label", "关闭证据面板");
    this.contentEl = doc.createElement("div");
    this.contentEl.className = "te-floating-content";
    this.headerEl.append(this.titleEl, this.closeButton);
    this.containerEl.append(this.headerEl, this.contentEl);
    for (const direction of ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const) {
      const element = doc.createElement("div");
      element.className = `te-resize-handle te-resize-${direction}`;
      element.setAttribute("aria-hidden", "true");
      this.resizeHandles.push({ element, direction });
      this.containerEl.appendChild(element);
    }
  }

  setTitle(title: string): void { this.titleEl.textContent = title; }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.moved = false;
    // Size belongs to this opening only, including when the same instance is reopened.
    this.containerEl.style.removeProperty("width");
    this.containerEl.style.removeProperty("height");
    const doc = this.containerEl.ownerDocument;
    this.previousFocus = doc.activeElement as HTMLElement | null;
    doc.body.appendChild(this.containerEl);
    this.load();
    this.containerEl.style.zIndex = String(++panelLayer);
    this.position();
    this.titleEl.focus({ preventScroll: true });
    this.onOpen();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    const restoreFocus = this.containerEl.contains(this.containerEl.ownerDocument.activeElement);
    this.endDrag();
    this.endResize();
    this.onClose();
    this.unload();
    this.containerEl.remove();
    if (restoreFocus && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }

  onOpen(): void {}
  onClose(): void {}

  onload(): void {
    const doc = this.containerEl.ownerDocument;
    const win = doc.defaultView!;
    this.registerDomEvent(this.closeButton, "click", () => this.close());
    this.registerDomEvent(this.containerEl, "pointerdown", () => {
      this.containerEl.style.zIndex = String(++panelLayer);
    });
    this.registerDomEvent(this.containerEl, "keydown", event => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
    this.registerDomEvent(this.headerEl, "pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || this.drag || this.resizing || (event.target as Element).closest("button, a, input")) return;
      const rect = this.containerEl.getBoundingClientRect();
      this.drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      this.headerEl.setPointerCapture(event.pointerId);
      this.containerEl.classList.add("is-dragging");
      event.preventDefault();
    });
    this.registerDomEvent(this.headerEl, "pointermove", event => {
      if (!this.drag || this.drag.pointer !== event.pointerId) return;
      this.moved = true;
      this.position(this.drag.left + event.clientX - this.drag.x, this.drag.top + event.clientY - this.drag.y);
    });
    const end = (event: PointerEvent): void => {
      if (this.drag?.pointer === event.pointerId) this.endDrag();
    };
    this.registerDomEvent(this.headerEl, "pointerup", end);
    this.registerDomEvent(this.headerEl, "pointercancel", end);
    this.registerDomEvent(this.headerEl, "lostpointercapture", end);
    for (const { element, direction } of this.resizeHandles) {
      this.registerDomEvent(element, "pointerdown", event => {
        if (event.button !== 0 || !event.isPrimary || this.drag || this.resizing) return;
        const rect = this.containerEl.getBoundingClientRect();
        this.resizing = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, direction, handle: element };
        element.setPointerCapture(event.pointerId);
        this.containerEl.classList.add("is-resizing");
        event.preventDefault();
      });
      this.registerDomEvent(element, "pointermove", event => {
        if (!this.resizing || this.resizing.pointer !== event.pointerId) return;
        this.resize(event.clientX - this.resizing.x, event.clientY - this.resizing.y);
      });
      const endResize = (event: PointerEvent): void => {
        if (this.resizing?.pointer === event.pointerId) this.endResize();
      };
      this.registerDomEvent(element, "pointerup", endResize);
      this.registerDomEvent(element, "pointercancel", endResize);
      this.registerDomEvent(element, "lostpointercapture", endResize);
    }
    this.registerDomEvent(this.titleEl, "keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const rect = this.containerEl.getBoundingClientRect();
      const step = event.shiftKey ? 4 : 20;
      this.moved = true;
      this.position(rect.left + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), rect.top + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0));
    });
    this.registerDomEvent(win, "resize", () => {
      this.endDrag();
      this.endResize();
      if (this.moved) {
        const rect = this.containerEl.getBoundingClientRect();
        this.position(rect.left, rect.top);
      } else this.position();
    });
    const endInteractions = (): void => { this.endDrag(); this.endResize(); };
    this.registerDomEvent(win, "blur", endInteractions);
    this.register(endInteractions);
  }

  private resize(dx: number, dy: number): void {
    const start = this.resizing!;
    const win = this.containerEl.ownerDocument.defaultView!;
    const minWidth = Math.min(320, Math.max(0, win.innerWidth - 24));
    const minHeight = Math.min(240, Math.max(0, win.innerHeight - 24));
    const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));
    let { left, top, width, height } = start;
    if (start.direction.includes("w")) {
      left = clamp(start.left + dx, 12, start.left + start.width - Math.min(minWidth, start.left + start.width - 12));
      width = start.left + start.width - left;
    } else if (start.direction.includes("e")) {
      const available = win.innerWidth - 12 - left;
      width = clamp(start.width + dx, Math.min(minWidth, available), available);
    }
    if (start.direction.includes("n")) {
      top = clamp(start.top + dy, 12, start.top + start.height - Math.min(minHeight, start.top + start.height - 12));
      height = start.top + start.height - top;
    } else if (start.direction.includes("s")) {
      const available = win.innerHeight - 12 - top;
      height = clamp(start.height + dy, Math.min(minHeight, available), available);
    }
    this.moved = true;
    this.containerEl.style.width = `${width}px`;
    this.containerEl.style.height = `${height}px`;
    this.position(left, top);
  }

  private endResize(): void {
    const resize = this.resizing;
    this.resizing = undefined;
    this.containerEl.classList.remove("is-resizing");
    if (resize?.handle.hasPointerCapture(resize.pointer)) resize.handle.releasePointerCapture(resize.pointer);
  }

  private position(left?: number, top?: number): void {
    const win = this.containerEl.ownerDocument.defaultView!;
    const rect = this.containerEl.getBoundingClientRect();
    const maxLeft = Math.max(12, win.innerWidth - rect.width - 12);
    const maxTop = Math.max(12, win.innerHeight - rect.height - 12);
    this.containerEl.style.left = `${Math.max(12, Math.min(left ?? win.innerWidth - rect.width - 20, maxLeft))}px`;
    this.containerEl.style.top = `${Math.max(12, Math.min(top ?? 64, maxTop))}px`;
  }

  private endDrag(): void {
    const pointer = this.drag?.pointer;
    this.drag = undefined;
    this.containerEl.classList.remove("is-dragging");
    if (pointer !== undefined && this.headerEl.hasPointerCapture(pointer)) this.headerEl.releasePointerCapture(pointer);
  }
}
