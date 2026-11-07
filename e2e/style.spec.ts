import { expect, test } from "@playwright/test";
import { trackPageErrors } from "./helpers";

const sections = [
  "Color",
  "Type",
  "Buttons",
  "Form fields",
  "Tabs",
  "Status",
  "Tables",
  "Feedback states",
  "Side panel",
  "Court board and calendar",
  "Mock API controls",
];

test("the style page renders every section without errors", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/owner/style");
  for (const name of sections) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("tabs move with the arrow keys and skip disabled tabs", async ({ page }) => {
  await page.goto("/owner/style");
  await page.getByRole("tab", { name: /Upcoming/ }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Past/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  // No-show is disabled, so End lands on Cancelled.
  await expect(page.getByRole("tab", { name: /Cancelled/ })).toBeFocused();
});

test("the side panel opens and closes with Escape", async ({ page }) => {
  await page.goto("/owner/style");
  await page.getByRole("button", { name: "Open side panel" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
