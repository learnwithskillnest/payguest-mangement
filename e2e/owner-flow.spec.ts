import { expect, test } from "@playwright/test";
import { currentPeriod, fmtPeriod, isoDate, periodStart } from "../src/lib/dates";

// One owner's first month, end to end, through the real forms.
test("owner sets up a PG, adds a tenant, bills rent and records a payment", async ({ page, browser }) => {
  const email = `owner-${Date.now()}@example.com`;
  const month = currentPeriod();

  // Sign up
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Priya Sharma");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile").fill("9811122233");
  await page.getByLabel("Password").fill("secret123");
  await page.getByLabel("PG name").fill("Green Leaf PG");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/rooms/);
  await expect(page.getByText("Welcome! Start by adding your rooms")).toBeVisible();

  // Settings: UPI ID
  await page.goto("/settings");
  await page.getByLabel("UPI ID").fill("greenleaf@okicici");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // Add a room with two beds
  await page.goto("/rooms");
  await page.getByLabel("Room name / number").fill("101");
  await page.getByLabel("Beds (sharing)").fill("2");
  await page.getByLabel("Rent per bed (₹)").fill("8000");
  await page.getByRole("button", { name: "Add room" }).click();
  await expect(page.getByText("Room 101 added with 2 beds.")).toBeVisible();
  await expect(page.getByText("Free since").first()).toBeVisible();

  // Add a tenant from the first of the month
  await page.goto("/tenants/new");
  await page.getByRole("combobox", { name: /^Bed\b/ }).selectOption({ index: 1 });
  await page.getByLabel("Move-in date").fill(isoDate(periodStart(month)));
  await page.getByLabel("Full name").fill("Rahul Verma");
  await page.getByLabel("Mobile (WhatsApp)").fill("9876543210");
  await page.getByLabel("ID number").fill("1234 5678 9012");
  await page.getByLabel("Deposit amount (₹)").fill("8000");
  await page.getByLabel("Received so far (₹)").fill("8000");
  await page.getByRole("button", { name: "Save tenant" }).click();
  await expect(page.getByRole("heading", { name: "Rahul Verma" })).toBeVisible();
  await expect(page.getByText("added to room 101")).toBeVisible();
  await expect(page.getByLabel("ID number")).toHaveValue("XXXX-XXXX-9012");

  // Bed board shows the tenant
  await page.goto("/rooms");
  await expect(page.getByRole("link", { name: "Rahul Verma" })).toBeVisible();

  // Generate this month's rent
  await page.goto("/rent");
  await page.getByRole("button", { name: `Generate ${fmtPeriod(month)} rent` }).click();
  await expect(page.getByText("Created 1 invoice")).toBeVisible();
  await page.getByRole("link", { name: "Rahul Verma" }).click();
  await expect(page.getByAltText("UPI QR code")).toBeVisible();
  const payLink = await page.getByRole("link", { name: /\/pay\// }).getAttribute("href");

  // Tenant view of the payment link (no login)
  const tenantCtx = await browser.newContext();
  const tenantPage = await tenantCtx.newPage();
  await tenantPage.goto(payLink!);
  await expect(tenantPage.getByText(`Hi Rahul, rent for ${fmtPeriod(month)}`)).toBeVisible();
  await expect(tenantPage.getByRole("link", { name: /Pay ₹8,000 with UPI app/ })).toHaveAttribute("href", /^upi:\/\/pay\?pa=greenleaf%40okicici/);
  await tenantPage.getByLabel("UPI ref / UTR").fill("412345678901");
  await tenantPage.getByRole("button", { name: "I have paid" }).click();
  await expect(tenantPage.getByText("Your PG owner will confirm")).toBeVisible();

  // Owner confirms the claim → receipt
  await page.goto("/rent");
  await expect(page.getByText("Tenants who say they've paid")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & issue receipt" }).click();
  await expect(page.getByText(/Receipt RCPT-00001/)).toBeVisible();
  await page.getByRole("link", { name: "Receipt" }).click();
  await page.getByRole("link", { name: "RCPT-00001" }).click();
  await expect(page.getByText("Received with thanks from")).toBeVisible();

  // Tenant now sees the receipt on their link
  await tenantPage.reload();
  await expect(tenantPage.getByText("All paid. Thank you!")).toBeVisible();
  await expect(tenantPage.getByRole("link", { name: "RCPT-00001" })).toBeVisible();
  await tenantCtx.close();

  // Electricity for this month: split goes to next month's invoice
  await page.goto(`/electricity?month=${month}`);
  await page.getByLabel("Room 101 previous reading").fill("1000");
  await page.getByLabel("Room 101 current reading").fill("1100");
  await page.getByRole("button", { name: "Save readings & split" }).click();
  await expect(page.getByText(/Saved 1 reading/)).toBeVisible();
  await expect(page.getByText("next invoice")).toBeVisible();

  // Expense and profit
  await page.goto("/expenses");
  await page.getByRole("combobox", { name: /^Category/ }).selectOption("FOOD");
  await page.getByLabel("Amount (₹)").fill("3000");
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("₹3,000 expense added.")).toBeVisible();
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Month by month" })).toBeVisible();

  // Tenant gives notice → bed shows free-from date
  await page.goto("/rooms");
  await page.getByRole("link", { name: "Rahul Verma" }).click();
  await page.getByRole("button", { name: "Record notice" }).click();
  await expect(page.getByText(/will be free from/)).toBeVisible();
  await page.goto("/rooms");
  await expect(page.getByText(/Free from/)).toBeVisible();

  // Dashboard
  await page.goto("/dashboard");
  await expect(page.getByText("Hello, Priya")).toBeVisible();
  await expect(page.getByText("Leaving soon")).toBeVisible();
});

test("protects the dashboard and rejects bad logins", async ({ page }) => {
  await page.goto("/tenants");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrongpass");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});
