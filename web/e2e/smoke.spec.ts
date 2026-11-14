import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:8799";
const HEADERS = { Origin: ORIGIN };
const DATA_DIR = process.env.TODOAPP_E2E_DIR!;
const LONG = "An extremely long task title that keeps going and going so that it would stretch the page if nothing wrapped it, ";

type Project = { id: string; name: string; status: string };

// Isolation: one server and one data folder serve the whole run, so every test starts
// by closing every active project. Closed projects are not shown on the board.
test.beforeEach(async ({ request }) => {
  const state = await (await request.get("/api/state")).json();
  for (const p of state.projects as Project[]) {
    if (p.status === "active") {
      const r = await request.post(`/api/projects/${p.id}/close`, { headers: HEADERS, data: {} });
      expect(r.ok()).toBeTruthy();
    }
  }
});

async function makeProject(request: APIRequestContext, name: string): Promise<Project> {
  const r = await request.post("/api/projects", { headers: HEADERS, data: { name } });
  expect(r.status()).toBe(201);
  return r.json();
}

async function makeTask(request: APIRequestContext, title: string, project_id: string, task_type: string) {
  const r = await request.post("/api/tasks", { headers: HEADERS, data: { title, project_id, task_type } });
  expect(r.status()).toBe(201);
}

async function fiveProjects(request: APIRequestContext, tasksPerCell = 1) {
  for (let i = 1; i <= 5; i++) {
    const p = await makeProject(request, `Project ${i}`);
    for (const type of ["urgent", "quick", "general", "objective"]) {
      for (let n = 0; n < tasksPerCell; n++) {
        await makeTask(request, `${LONG}${LONG}(${i} ${type} ${n})`, p.id, type);
      }
    }
  }
}

test("capture, tick, open pop-up, set due date", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first project" }).click();
  await page.getByRole("textbox", { name: "Project name" }).fill("Twin Pilot");
  await page.keyboard.press("Enter");
  await page.getByRole("row", { name: /Quick/ }).getByText("+ add").click();
  await page.keyboard.type("Chase Sam");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Chase Sam")).toBeVisible();
  await page.getByText("Chase Sam").click();
  await page.getByRole("button", { name: /no date/i }).click();
  await page.getByText("Tomorrow").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /Quick/ }).getByText("Tomorrow")).toBeVisible();
  await page.getByRole("checkbox").first().click();
  await expect(page.locator("[data-task-id]").first()).toHaveClass(/done/);
});

test("Escape closes the pop-up straight after picking a date", async ({ page, request }) => {
  const p = await makeProject(request, "Esc Project");
  await makeTask(request, "Escape me", p.id, "quick");
  await page.goto("/");
  await page.getByText("Escape me").click();
  await page.getByRole("button", { name: /no date/i }).click();
  await page.getByText("Tomorrow", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 2000 });
});

for (const width of [1366, 1536, 1920]) {
  test(`five projects fit at ${width}px`, async ({ page, request }) => {
    await fiveProjects(request);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("[data-task-id]")).toHaveCount(20);
    const grid = await page.evaluate(() => {
      const g = document.querySelector(".grid-scroll")!;
      return g.scrollWidth <= g.clientWidth;
    });
    expect(grid).toBe(true);
    const page_ = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(page_).toBe(true);
  });
}

test("at 1000px the page scrolls and the headers stay put", async ({ page, request }) => {
  await fiveProjects(request, 4);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await expect(page.locator("[data-task-id]")).toHaveCount(80);
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(scrolls).toBe(true);
  await page.evaluate(() => window.scrollTo(400, 300));
  await page.waitForFunction(() => window.scrollX > 0 && window.scrollY > 0);
  const m = await page.evaluate(() => {
    const top = document.querySelector("header.top")!.getBoundingClientRect();
    const row = document.querySelector('[role="rowheader"]')!.getBoundingClientRect();
    const col = document.querySelector('[role="columnheader"]')!.getBoundingClientRect();
    return { sx: window.scrollX, sy: window.scrollY, topLeft: top.left, topBottom: top.bottom, rowLeft: row.left, colTop: col.top };
  });
  expect(m.sx).toBeGreaterThan(0);
  expect(m.sy).toBeGreaterThan(0);
  expect(Math.abs(m.topLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.rowLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(m.colTop - m.topBottom)).toBeLessThanOrEqual(1);
});

test("a file dropped in inbox appears live", async ({ page, request }) => {
  await makeProject(request, "Inbox Project");
  await page.goto("/");
  await expect(page.getByText("Inbox Project").first()).toBeVisible();
  const inbox = path.join(DATA_DIR, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  const tmp = path.join(inbox, "x.tmp");
  fs.writeFileSync(tmp, JSON.stringify({ tasks: [{ title: "Dropped in by file", project: "Inbox Project", task_type: "quick" }] }));
  fs.renameSync(tmp, path.join(inbox, "x.json")); // appears whole, never half-written
  await expect(page.getByText("Dropped in by file")).toBeVisible({ timeout: 5000 });
});
