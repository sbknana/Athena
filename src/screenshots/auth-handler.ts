// Athena - Auth Handler for Screenshot Engine
// Copyright 2026, Forgeborn

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import type { AuthConfig } from "../types.js";

/**
 * Load auth configuration from athena.config.json or .env file.
 */
export async function loadAuthConfig(
  projectDir: string
): Promise<AuthConfig | null> {
  // Try athena.config.json first
  const configPath = join(projectDir, "athena.config.json");
  if (existsSync(configPath)) {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    if (config.auth) {
      return config.auth as AuthConfig;
    }
  }

  // Try .env file
  const envPath = join(projectDir, ".env");
  if (existsSync(envPath)) {
    const envContent = await readFile(envPath, "utf-8");
    const envVars = parseEnvFile(envContent);

    const username =
      envVars.ATHENA_AUTH_USERNAME ??
      envVars.TEST_USERNAME ??
      envVars.ADMIN_USERNAME;
    const password =
      envVars.ATHENA_AUTH_PASSWORD ??
      envVars.TEST_PASSWORD ??
      envVars.ADMIN_PASSWORD;

    if (username && password) {
      return {
        loginUrl: envVars.ATHENA_LOGIN_URL ?? "/login",
        usernameSelector:
          envVars.ATHENA_USERNAME_SELECTOR ?? 'input[name="email"], input[name="username"], input[type="email"]',
        passwordSelector:
          envVars.ATHENA_PASSWORD_SELECTOR ?? 'input[name="password"], input[type="password"]',
        submitSelector:
          envVars.ATHENA_SUBMIT_SELECTOR ?? 'button[type="submit"]',
        username,
        password,
        successIndicator: envVars.ATHENA_SUCCESS_INDICATOR,
      };
    }
  }

  return null;
}

/**
 * Perform login using the configured auth strategy.
 * Returns true if login was successful.
 */
export async function performLogin(
  page: Page,
  baseUrl: string,
  auth: AuthConfig
): Promise<boolean> {
  const loginUrl = auth.loginUrl.startsWith("http")
    ? auth.loginUrl
    : `${baseUrl}${auth.loginUrl}`;

  console.log(`  Logging in at ${loginUrl}...`);

  try {
    await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 15_000 });

    // Fill username
    const usernameField = page.locator(auth.usernameSelector).first();
    await usernameField.waitFor({ state: "visible", timeout: 5_000 });
    await usernameField.fill(auth.username);

    // Fill password
    const passwordField = page.locator(auth.passwordSelector).first();
    await passwordField.waitFor({ state: "visible", timeout: 5_000 });
    await passwordField.fill(auth.password);

    // Submit and wait for URL to change (handles SPA logins that use fetch + redirect)
    const submitButton = page.locator(auth.submitSelector).first();
    await submitButton.click();

    // Wait for either: URL change, success indicator, or networkidle (whichever first)
    const loginPath = new URL(loginUrl).pathname;
    try {
      await page.waitForURL((url) => new URL(url).pathname !== loginPath, {
        timeout: 15_000,
      });
      console.log("  Login successful (navigated away from login page)");
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
      return true;
    } catch {
      // URL didn't change — try checking for success indicator
      if (auth.successIndicator) {
        try {
          await page.waitForSelector(auth.successIndicator, { timeout: 3_000 });
          console.log("  Login successful (indicator found)");
          return true;
        } catch {
          // fall through
        }
      }

      // Final check — maybe the URL changed after our timeout
      const currentUrl = page.url();
      if (new URL(currentUrl).pathname !== loginPath) {
        console.log("  Login successful (URL changed on recheck)");
        return true;
      }

      console.log("  Login failed (still on login page after 15s)");
      return false;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`  Login failed: ${msg}`);
    return false;
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}
