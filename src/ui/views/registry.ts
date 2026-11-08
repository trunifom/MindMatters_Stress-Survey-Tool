import type { AppState, Store, View } from "../state";
import type { TextKey } from "../i18n";
import { renderCheck } from "./check";
import { renderItems } from "./items";
import { renderPreview } from "./preview";
import { renderStructure } from "./structure";
import { renderTexts } from "./texts";

export interface ViewContext {
  state: AppState;
  store: Store;
}

export interface ViewDef {
  id: View;
  label: TextKey;
  /** One sentence under the heading that says what to do here. */
  intro: TextKey;
  render(ctx: ViewContext): HTMLElement;
}

/** Views offered as tabs, in order. */
export const VIEWS: ViewDef[] = [
  { id: "items", label: "tab.items", intro: "view.items.intro", render: renderItems },
  { id: "structure", label: "tab.structure", intro: "view.structure.intro", render: renderStructure },
  { id: "texts", label: "tab.texts", intro: "view.texts.intro", render: renderTexts },
  { id: "preview", label: "tab.preview", intro: "view.preview.intro", render: renderPreview },
  { id: "check", label: "tab.check", intro: "view.check.intro", render: renderCheck },
];
