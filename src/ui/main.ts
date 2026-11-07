import { APP_VERSION } from "../version";
import { mountApp } from "./app";
import { createStore, initialState } from "./state";

declare const __APP_VERSION__: string | undefined;

const root = document.getElementById("app");
if (root) {
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : APP_VERSION;
  mountApp(root, createStore(initialState(navigator.language)), {
    confirm: (message) => window.confirm(message),
    appVersion: version,
  });
}
