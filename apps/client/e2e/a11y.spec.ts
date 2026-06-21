import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.0 + 2.1, levels A and AA — the conformance target for RaidMate.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Run axe over the current page state and assert zero violations. On failure
 * the violations are attached to the test (id, impact, rule, offending nodes)
 * so the report is actionable without re-running.
 */
async function expectNoA11yViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  if (violations.length > 0) {
    const detail = violations
      .map(
        (v) =>
          `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length})\n` +
          v.nodes
            .slice(0, 8)
            .map((n) => `    ${n.target.join(' ')}`)
            .join('\n'),
      )
      .join('\n');
    test.info().annotations.push({ type: `axe:${label}`, description: detail });
  }
  expect(violations, `WCAG A/AA violations in: ${label}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Force English so accessible names (which we select by below) are
  // deterministic regardless of the runner's navigator.language. Matches
  // persistedRef's storage format: JSON.stringify('en').
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rm.i18n.apiLang', '"en"');
    } catch {
      /* storage unavailable — fall back to default locale */
    }
  });
  await page.goto('/');
  // App shell + Leaflet map mounted.
  await page.locator('[role="application"]').waitFor();
});

test('default map view', async ({ page }) => {
  // Wait until at least one extract marker has rendered (they get a name
  // asynchronously once the layer loads).
  await page.locator('.leaflet-extracts-pane [role="button"]').first().waitFor();
  await expectNoA11yViolations(page, 'default map view');
});

test('settings drawer (all sections expanded)', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  // Desktop viewport opens every section; expand any that are still collapsed.
  for (const header of await page.locator('.p-accordionheader[aria-expanded="false"]').all()) {
    await header.click();
  }
  await page.locator('.p-drawer').waitFor();
  await expectNoA11yViolations(page, 'settings drawer');
});

test('map-selector flyout', async ({ page }) => {
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.locator('.layer-rail__flyout').waitFor();
  await expectNoA11yViolations(page, 'map-selector flyout');
});

test('player layer flyout', async ({ page }) => {
  await page.getByRole('button', { name: 'Player', exact: true }).click();
  await page.locator('.layer-rail__flyout').waitFor();
  await expectNoA11yViolations(page, 'player layer flyout');
});
