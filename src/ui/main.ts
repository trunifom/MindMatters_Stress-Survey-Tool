/**
 * Entry point of the browser build (bundled by tools/build.mjs into the single HTML file).
 *
 * Creates the store with the system theme, mounts the app, installs the global error handlers and asks before the
 * tab is closed with unsaved changes (T42). It must stay free of logic: everything testable lives in state.ts and
 * app.ts. No network access and no storage of any kind happens here (T41).
 */

import { APP_VERSION } from "../version";
import { mountApp } from "./app";
import { installGlobalHandlers } from "./errors";
import { systemTheme } from "./prefs";
import { createStore, initialState } from "./state";

declare const __APP_VERSION__: string | undefined;

const root = document.getElementById("app");
if (root) {
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : APP_VERSION;
  const store = createStore(initialState(navigator.language, { theme: systemTheme() }));
  mountApp(root, store, {
    confirm: (message) => window.confirm(message),
    appVersion: version,
  });
  installGlobalHandlers(store, window);
  // Closing or reloading the tab with unsaved changes asks first (T42). The browser shows its own text.
  window.addEventListener("beforeunload", (ev) => {
    if (store.get().dirty) {
      ev.preventDefault();
      ev.returnValue = "";
    }
  });
}
