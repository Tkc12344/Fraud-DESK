import { expect, test } from "@playwright/test";

async function scorePreset(page, name) {
  await page.goto("/score");
  await page.getByRole("button", { name }).click();
  await page.getByRole("button", { name: "Score transaction" }).click();
}

test.describe.configure({ mode: "serial" });

test("an analyst releases a review case and the decision is stored", async ({ page }) => {
  const origin = `E2E${Date.now()}`;
  const note = `release ${origin}`;

  await page.goto("/score");
  await page.getByRole("button", { name: /Large transfer, empty destination/ }).click();
  await page.getByRole("textbox", { name: "Origin account" }).fill(origin);
  await page.getByRole("button", { name: "Score transaction" }).click();

  await expect(page.getByText("REVIEW", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting on an analyst")).toBeVisible();
  await expect(page.getByText("LARGE_TRANSFER_OVER_200K")).toBeVisible();
  await expect(page.getByText(/Rules raised this score/)).toBeVisible();

  await page.getByRole("link", { name: /^Queue/ }).click();
  const card = page.locator(".queue-card").first();
  await expect(card).toContainText("250,000.00");
  await card.getByRole("textbox", { name: "Analyst note" }).fill(note);
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(`input[value="${note}"]`)).toHaveCount(0);

  await page.goto("/");
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toContainText("250,000.00");
  await expect(firstRow).toContainText("APPROVE");
  await expect(firstRow).toContainText("REVIEW");
  await firstRow.getByRole("link").click();

  await expect(page.getByText(origin, { exact: true })).toBeVisible();
  await expect(page.getByText("Model said REVIEW")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue(note);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue(note);
});

test("a merchant payment is approved without the model", async ({ page }) => {
  await scorePreset(page, /Merchant payment/);
  await expect(page.getByText("APPROVE", { exact: true })).toBeVisible();
  await expect(page.getByText("Type gate")).toBeVisible();
  await expect(page.getByText("No rules fired.")).toBeVisible();
  await expect(page.getByText("No reason codes.")).toBeVisible();
});

test("a full-balance transfer is blocked and explained", async ({ page }) => {
  await scorePreset(page, /Full-balance transfer/);
  await expect(page.getByText("BLOCK", { exact: true })).toBeVisible();
  await expect(page.getByText("DRAINS_ENTIRE_BALANCE")).toBeVisible();
  await expect(page.getByText("Amount equals the sender's entire balance")).toBeVisible();
  await expect(page.getByText("drains_account")).toBeVisible();
  await expect(page.getByText("Closed")).toBeVisible();
});

test("the desk shows the live policy and model metric", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Desk" })).toBeVisible();
  await expect(page.getByText("Review at")).toBeVisible();
  await expect(page.getByText("Block at")).toBeVisible();
  await expect(page.getByText(/Holdout PR-AUC 1\.000/)).toBeVisible();
});
