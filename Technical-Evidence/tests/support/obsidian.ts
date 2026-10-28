import { StateField } from "@codemirror/state";
import { vi } from "vitest";

// Only the public boundaries used by repository/editor tests are replaced.
export class App {}
export class Component {
  private loaded = false;
  private cleanup: (() => void)[] = [];
  private children: Component[] = [];
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.onload();
    this.children.forEach(child => child.load());
  }
  unload(): void {
    if (!this.loaded) return;
    this.loaded = false;
    this.children.splice(0).forEach(child => child.unload());
    this.cleanup.splice(0).reverse().forEach(callback => callback());
  }
  onload(): void {}
  addChild<T extends Component>(child: T): T {
    this.children.push(child);
    if (this.loaded) child.load();
    return child;
  }
  removeChild<T extends Component>(child: T): T {
    this.children = this.children.filter(value => value !== child);
    child.unload();
    return child;
  }
  register(callback: () => void): void { this.cleanup.push(callback); }
  registerDomEvent(target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, callback, options);
    this.register(() => target.removeEventListener(type, callback, options));
  }
}
export class TFile {
  extension: string;
  basename: string;
  constructor(public path: string) {
    this.extension = path.split(".").pop()!;
    this.basename = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  }
}
export const resolveSubpath = vi.fn();
export function parseLinktext(text: string): { path: string; subpath: string } {
  const index = text.indexOf("#");
  return index < 0 ? { path: text, subpath: "" } : { path: text.slice(0, index), subpath: text.slice(index) };
}
export class Notice { constructor(_text: string) {} }
export class MarkdownRenderer {
  static render = vi.fn(async (_app: unknown, text: string, target: HTMLElement, _source: string, _component: unknown) => {
    target.textContent = text;
  });
}
export const editorInfoField = StateField.define({
  create: () => ({ file: { path: "Notes/Report.md" } }),
  update: value => value
});
export const editorLivePreviewField = StateField.define({ create: () => true, update: value => value });
