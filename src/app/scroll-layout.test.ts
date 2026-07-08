import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const globals = readSource("src/app/globals.scss");
const shellStyles = readSource("src/features/shell/AppShell.module.scss");
const templateStyles = readSource("src/components/templates/Templates.module.scss");
const moleculeStyles = readSource("src/components/molecules/Molecules.module.scss");
const organismStyles = readSource("src/components/organisms/Organisms.module.scss");
const schedulePageStyles = readSource("src/app/(app)/schedule/page.module.scss");
const scheduleStyles = readSource("src/features/events/ScheduleCalendar.module.scss");

describe("scroll layout", () => {
  it("keeps the app frame fixed instead of scrolling the document", () => {
    expect(globals).toContain("--app-frame-height: 100dvh;");
    expect(globals).toMatch(/body\s*{[\s\S]*?overflow:\s*hidden;/);
    expect(shellStyles).toMatch(
      /\.shell\s*{[\s\S]*?height:\s*var\(--app-frame-height\);/,
    );
    expect(shellStyles).toMatch(/\.shell\s*{[\s\S]*?overflow:\s*hidden;/);
    expect(shellStyles).toMatch(/\.shell-layout\s*{[\s\S]*?min-height:\s*0;/);
    expect(shellStyles).toMatch(/\.shell-content\s*{[\s\S]*?overflow:\s*hidden;/);
  });

  it("assigns scrolling to management content and table areas", () => {
    expect(templateStyles).toMatch(
      /\.management-page,\s*\.form-page\s*{[\s\S]*?min-height:\s*0;/,
    );
    expect(templateStyles).toContain("grid-template-rows: auto auto auto minmax(0, 1fr);");
    expect(templateStyles).toMatch(/\.management-list\s*{[\s\S]*?grid-row:\s*4;/);
    expect(templateStyles).toMatch(/\.management-list\s*{[\s\S]*?overflow:\s*hidden;/);
    expect(moleculeStyles).toMatch(/\.table-scroll-area\s*{[\s\S]*?overflow:\s*auto;/);
    expect(organismStyles).toMatch(/\.data-panel\s*{[\s\S]*?min-height:\s*0;/);
  });

  it("keeps schedule toolbars fixed while calendar content scrolls internally", () => {
    expect(schedulePageStyles).toMatch(
      /\.schedule-page\s*{[\s\S]*?grid-template-rows:\s*var\(--schedule-toolbar-height\) minmax\(0, 1fr\);/,
    );
    expect(schedulePageStyles).toMatch(/\.schedule-page\s*{[\s\S]*?overflow:\s*hidden;/);
    expect(scheduleStyles).toMatch(
      /\.schedule-toolbar\s*{[\s\S]*?min-height:\s*var\(--schedule-toolbar-height\);/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-toolbar\s*{[\s\S]*?border-bottom:\s*var\(--hairline-width\) solid var\(--hairline\);/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-scroll-area\s*{[\s\S]*?height:\s*100%;/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-scroll-area\s*{[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-scroll-area\s*{[\s\S]*?padding:\s*var\(--spacing-lg\);/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-scroll-area-month\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 7fr\) minmax\(0, 3fr\);/,
    );
    expect(scheduleStyles).toMatch(/\.schedule-scroll-area-month\s*{[\s\S]*?align-items:\s*stretch;/);
    expect(scheduleStyles).toMatch(/\.schedule-month\s*{[\s\S]*?height:\s*100%;/);
    expect(scheduleStyles).toMatch(
      /\.schedule-month\s*{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);/,
    );
    expect(scheduleStyles).toMatch(/\.schedule-month\s*{[\s\S]*?min-height:\s*0;/);
    expect(scheduleStyles).toMatch(
      /\.schedule-month-grid\s*{[\s\S]*?grid-auto-rows:\s*minmax\(var\(--schedule-month-day-min-height\), 1fr\);/,
    );
    expect(scheduleStyles).toMatch(/\.schedule-week\s*{[\s\S]*?min-height:\s*0;/);
  });
});
