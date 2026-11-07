import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { loadCatalog, loadProject } from "../../src/core/loader";

/**
 * Real-browser test of dist/mindmatters.html opened from file:// (T01, T02, T39, T40, T41).
 * Uses an installed Chromium-based browser (Edge or Chrome); nothing is downloaded.
 * Set MM_BROWSER_PATH to choose the executable. Without a browser the suite is skipped
 * (and says so), it never passes silently.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = join(root, "dist", "mindmatters.html");
const example = join(root, "examples", "catalog_rich_0_4_0.json");

const CANDIDATES = [
  process.env.MM_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter((p): p is string => !!p);
const executablePath = CANDIDATES.find((p) => existsSync(p));

describe.skipIf(!executablePath)(`real browser (${executablePath ?? "none found"})`, () => {
  let browser: Browser;
  let browserVersion = "";

  beforeAll(async () => {
    execFileSync(process.execPath, [join(root, "tools", "build.mjs")], { cwd: root, stdio: "pipe" });
    browser = await chromium.launch({ executablePath, headless: true });
    browserVersion = browser.version();
    console.log(`browser: ${browserVersion}`);
  });
  afterAll(async () => {
    await browser?.close();
  });

  /** A fresh page with request and error recording. */
  async function open(options: { viewport?: { width: number; height: number }; colorScheme?: "dark" | "light"; offline?: boolean } = {}) {
    const context: BrowserContext = await browser.newContext({
      viewport: options.viewport ?? { width: 1200, height: 900 },
      colorScheme: options.colorScheme ?? "light",
      acceptDownloads: true,
      locale: "de-CH",
    });
    if (options.offline) await context.setOffline(true);
    const page: Page = await context.newPage();
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push("console: " + m.text());
    });
    await page.goto(pathToFileURL(html).href);
    return { context, page, requests, errors };
  }

  const loadExample = async (page: Page) => {
    await page.setInputFiles("#catalog-file", example);
    await page.waitForSelector("#cat-h");
  };

  it("T01/T02: runs from file:// offline, makes no request except to itself, and shows no errors", async () => {
    const { context, page, requests, errors } = await open({ offline: true });
    expect(await page.textContent("h1")).toBe("MindMatters Fragebogen-Konfigurator"); // de-CH browser -> German
    await loadExample(page);
    // the interface is German, the catalog texts stay in the catalog language (en)
    expect(await page.textContent("#cat-h")).toBe("Rich 0.4.0 feature example");
    // walk through every view and dialog
    await page.click("[data-focus=info-item-demo_01]");
    await page.waitForSelector("[role=dialog]");
    await page.keyboard.press("Escape");
    await page.click("[data-focus=tab-preview]");
    await page.waitForSelector(".pv");
    await page.click("[data-focus=tab-check]");
    await page.waitForSelector("#save-project");
    const foreign = requests.filter((u) => !/^(file|data|blob|about):/i.test(u));
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  it("the page title and language reflect the interface", async () => {
    const { context, page } = await open();
    expect(await page.title()).toBe("MindMatters");
    expect(await page.getAttribute("html", "lang")).toBe("de");
    await page.click("[data-focus=ui-lang-en]");
    expect(await page.getAttribute("html", "lang")).toBe("en");
    expect(await page.textContent("h1")).toBe("MindMatters questionnaire configurator");
    await context.close();
  });

  it("the Content-Security-Policy really blocks connections in this browser", async () => {
    const { context, page } = await open();
    const violations = await page.evaluate(
      () =>
        new Promise<{ blocked: boolean; directive: string }>((resolve) => {
          document.addEventListener("securitypolicyviolation", (e) => resolve({ blocked: true, directive: e.violatedDirective }), { once: true });
          fetch("http://127.0.0.1:9/ping").catch(() => undefined);
          setTimeout(() => resolve({ blocked: false, directive: "" }), 3000);
        }),
    );
    expect(violations.blocked).toBe(true);
    expect(violations.directive).toBe("connect-src");
    await context.close();
  });

  it("T39: the whole core flow works with the keyboard alone, with a visible focus", async () => {
    const { context, page } = await open();
    // skip link is the first stop
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.className)).toContain("skip-link");

    // reach the file input by keyboard and open the file chooser with Space
    let guard = 0;
    while ((await page.evaluate(() => document.activeElement?.id)) !== "catalog-file" && guard++ < 12) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("catalog-file");
    const label = await page.evaluate(() => {
      const l = document.querySelector("label[for=catalog-file]") as HTMLElement;
      const cs = getComputedStyle(l);
      return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
    });
    expect(label.outlineStyle).not.toBe("none"); // focus ring on the visible label
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Space")]);
    await chooser.setFiles(example);
    await page.waitForSelector("#cat-h");

    // tab to an optional checkbox and toggle it with Space
    await page.focus("#item-demo_04");
    const before = await page.isChecked("#item-demo_04");
    await page.keyboard.press("Space");
    expect(await page.isChecked("#item-demo_04")).toBe(!before);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("item-demo_04"); // focus survives the re-render
    const ring = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as HTMLElement);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect(ring.style).not.toBe("none");
    expect(ring.width).toBeGreaterThanOrEqual(2);

    // open the info dialog with Enter, Tab stays inside, Escape returns focus
    await page.focus("[data-focus=info-item-demo_04]");
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role=dialog]");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("info-close");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest(".modal"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-focus"))).toBe("info-item-demo_04");
    await context.close();
  });

  it("downloads the project, the check report and the codebook as real files that load again", async () => {
    const { context, page } = await open();
    await loadExample(page);
    await page.click("#item-demo_04"); // change something
    await page.click("[data-focus=tab-check]");
    const catalogText = readFileSync(example, "utf8");
    const cat = loadCatalog(catalogText);
    expect(cat.ok).toBe(true);

    const dl = async (selector: string) => {
      const [download] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
      const file = await download.path();
      return { name: download.suggestedFilename(), text: readFileSync(file!, "utf8") };
    };

    const project = await dl("#save-project");
    expect(project.name).toBe("example_rich_1.0.0_project.json");
    const loaded = loadProject(project.text, cat.catalog!);
    expect(loaded.ok).toBe(true);
    expect(loaded.result!.selection).not.toContain("demo_04");
    expect(project.text).not.toContain("I like going to school");

    const report = await dl("#save-report");
    expect(report.name).toBe("example_rich_1.0.0_check-report.json");
    expect(JSON.parse(report.text).reportType).toBe("questionnaireCheckReport");

    const codebook = await dl("#save-codebook");
    expect(codebook.name).toBe("example_rich_1.0.0_codebook.en.md");
    expect(codebook.text).toMatch(/^# Codebook: /);
    expect(codebook.text).toContain("Draft – not released for productive use");
    await context.close();
  });

  it("the LimeSurvey test export downloads a real file with a byte order mark and the TEST label", async () => {
    const { context, page } = await open();
    await loadExample(page);
    await page.click("[data-focus=tab-check]");
    expect(await page.isDisabled("#native-export-limesurvey")).toBe(true); // the example is a draft
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#test-export-limesurvey")]);
    const bytes = readFileSync((await download.path())!);
    expect(download.suggestedFilename()).toBe("example_rich_1.0.0_limesurvey_TEST.txt");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString("utf8");
    expect(text).toContain("surveyls_title");
    expect(text).toContain("TEST");
    expect(text.split("\n")[1]).toContain("\t"); // tab separated
    await context.close();
  });

  it("the ZIP package downloads as a real archive with the README and the exports", async () => {
    const { context, page } = await open();
    await loadExample(page);
    await page.click("[data-focus=tab-check]");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save-package")]);
    const bytes = readFileSync((await download.path())!);
    expect(download.suggestedFilename()).toBe("example_rich_1.0.0_paket.zip");
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = bytes.toString("latin1");
    for (const name of ["LIESMICH.txt", "_project.json", "_check-report.json", "_codebook.en.md", "export/"]) expect(text, name).toContain(name);
    await context.close();
  });

  it("the print layout hides the controls and keeps the preview", async () => {
    const { context, page } = await open();
    await loadExample(page);
    await page.click("[data-focus=tab-preview]");
    await page.emulateMedia({ media: "print" });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".tabs") as Element).display)).toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".skip-link") as Element).display)).toBe("none");
    expect(await page.evaluate(() => document.querySelectorAll(".pv-item").length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
    await context.close();
  });

  it("a saved project can be loaded again through the project file input", async () => {
    const { context, page } = await open();
    await loadExample(page);
    await page.click("#item-demo_04");
    await page.click("[data-focus=tab-check]");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#save-project")]);
    const saved = (await download.path())!;
    await page.click("[data-focus=tab-items]");
    await page.click("#item-demo_04"); // change back
    expect(await page.isChecked("#item-demo_04")).toBe(true);
    page.once("dialog", (d) => d.accept()); // unsaved changes are announced before loading
    await page.setInputFiles("#project-file", saved);
    await page.waitForFunction(() => !(document.querySelector("#item-demo_04") as HTMLInputElement | null)?.checked);
    expect(await page.isChecked("#item-demo_04")).toBe(false);
    await context.close();
  });

  it("asks before the tab is reloaded with unsaved changes (T42)", async () => {
    const { context, page } = await open();
    await loadExample(page);
    await page.click("#item-demo_04"); // user interaction makes the dialog eligible
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.type());
      await d.dismiss();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
    const prevented = await page.evaluate(() => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
    // after saving there is nothing to ask for
    await page.click("[data-focus=tab-check]");
    await Promise.all([page.waitForEvent("download"), page.click("#save-project")]);
    const preventedAfterSave = await page.evaluate(() => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(preventedAfterSave).toBe(false);
    await context.close();
  });

  it("T41: markup and script in catalog texts stay inert in a real browser", async () => {
    const doc = JSON.parse(readFileSync(example, "utf8"));
    doc.items.find((i: any) => i.id === "demo_01").text.en = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
    const dir = mkdtempSync(join(tmpdir(), "mm-"));
    const file = join(dir, "evil.json");
    writeFileSync(file, JSON.stringify(doc));
    const { context, page } = await open();
    await page.setInputFiles("#catalog-file", file);
    await page.waitForSelector("#cat-h");
    await page.click("[data-focus=tab-preview]");
    await page.waitForSelector(".pv");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.locator(".pv img").count()).toBe(0);
    expect(await page.textContent(".pv")).toContain("<script>window.__pwned=2</script>");
    await context.close();
  });

  it("responsive: no horizontal scrolling on a phone-sized screen, in every view", async () => {
    const { context, page } = await open({ viewport: { width: 375, height: 700 } });
    await loadExample(page);
    for (const tab of ["items", "preview", "check"]) {
      await page.click(`[data-focus=tab-${tab}]`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, tab).toBeLessThanOrEqual(0);
    }
    await page.click("[data-focus=tab-items]");
    await page.click("[data-focus=info-item-demo_01]");
    const dialogOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(dialogOverflow).toBeLessThanOrEqual(0);
    await context.close();
  });

  it("follows the system colour scheme", async () => {
    const light = await open({ colorScheme: "light" });
    const dark = await open({ colorScheme: "dark" });
    const bg = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg(light.page)).not.toBe(await bg(dark.page));
    await light.context.close();
    await dark.context.close();
  });

  it("T40: loads and validates a 1000 item / 5 MB catalog in the browser within the target time", async () => {
    const doc = JSON.parse(readFileSync(example, "utf8"));
    const template = doc.items.find((i: any) => i.id === "demo_01");
    const ids: string[] = [];
    for (let n = 1; n <= 1000; n++) {
      const id = `bulk_${String(n).padStart(4, "0")}`;
      ids.push(id);
      doc.items.push({ ...template, id, variableName: id, inclusionRequired: false, defaultSelected: false, displayNumber: String(n), exportHints: undefined, documentation: { summary: { en: "x".repeat(4400) } } });
    }
    doc.questionnaire.sections.push({ id: "bulk", title: { en: "Bulk" }, itemRefs: ids });
    const dir = mkdtempSync(join(tmpdir(), "mm-"));
    const file = join(dir, "big.json");
    writeFileSync(file, JSON.stringify(doc));
    const size = readFileSync(file).length;
    expect(size).toBeGreaterThan(4_000_000);

    const { context, page } = await open();
    const t0 = Date.now();
    await page.setInputFiles("#catalog-file", file);
    await page.waitForSelector("#cat-h", { timeout: 30_000 });
    await page.waitForSelector("#item-bulk_1000");
    const ms = Date.now() - t0;
    console.log(`T40 browser: ${(size / 1e6).toFixed(2)} MB, ${doc.items.length} items, shown after ${ms} ms (${browserVersion})`);
    expect(ms).toBeLessThan(5000);
    expect(await page.locator("li.item").count()).toBe(doc.items.length);
    await context.close();
  });
});
