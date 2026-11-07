import type { AppState, Store, View } from "../state";
import type { TextKey } from "../i18n";
import { renderCheck } from "./check";
import { renderItems } from "./items";

export interface ViewContext {
  state: AppState;
  store: Store;
}

export interface ViewDef {
  id: View;
  label: TextKey;
  render(ctx: ViewContext): HTMLElement;
}

/** Views offered as tabs, in order. */
export const VIEWS: ViewDef[] = [
  { id: "items", label: "tab.items", render: renderItems },
  { id: "check", label: "tab.check", render: renderCheck },
];
