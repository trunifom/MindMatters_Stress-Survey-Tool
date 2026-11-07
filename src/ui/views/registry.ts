import type { AppState, Store, View } from "../state";
import type { TextKey } from "../i18n";
import { renderCheck } from "./check";

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
export const VIEWS: ViewDef[] = [{ id: "check", label: "tab.check", render: renderCheck }];
