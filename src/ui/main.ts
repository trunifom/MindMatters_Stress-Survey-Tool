import { APP_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "../version";

declare const __APP_VERSION__: string;

const app = document.getElementById("app");
if (app) {
  app.textContent = `MindMatters ${typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : APP_VERSION} (Schema ${SUPPORTED_SCHEMA_VERSIONS.join(", ")})`;
}
