import { expect, test } from "@playwright/test";

// U19 first run, on the second e2e server whose demo has no profile (playwright.config.ts, project
// "onboarding"). One test: it sets the profile, so the server is onboarded afterwards.
test("first run: sign in, pick a birth date and sex, Save and continue lands on Home", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with demo data" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { level: 1, name: "Two things Google doesn’t share" })).toBeVisible();

  // Birth date: the field opens three wheels; tapping a row picks it.
  const field = page.getByRole("button", { name: "Birth date" });
  await expect(field).toHaveText("Choose your birth date");
  await field.click();
  await page.getByRole("listbox", { name: "Year" }).getByRole("option", { name: "1990", exact: true }).click();
  await page.getByRole("listbox", { name: "Month" }).getByRole("option", { name: "June", exact: true }).click();
  await page.getByRole("listbox", { name: "Day" }).getByRole("option", { name: "15", exact: true }).click();
  await expect(field).toHaveText("June 15, 1990");

  await page.getByText("Female", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Female" })).toBeChecked();

  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeAttached();

  // Onboarded: the gate now sends /onboarding home.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});
