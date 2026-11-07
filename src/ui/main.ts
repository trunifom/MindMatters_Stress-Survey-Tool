import { APP_VERSION } from "../version";
import { mountApp } from "./app";
import { createStore, initialState } from "./state";

declare const __APP_VERSION__: string | undefined;

const root = document.getElementById("app");
if (root) {
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : APP_VERSION;
  const store = createStore(initialState(navigator.language));
  mountApp(root, store, {
    confirm: (message) => window.confirm(message),
    appVersion: version,
  });
  // Closing or reloading the tab with unsaved changes asks first (T42). The browser shows its own text.
  window.addEventListener("beforeunload", (ev) => {
    if (store.get().dirty) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  });
}
