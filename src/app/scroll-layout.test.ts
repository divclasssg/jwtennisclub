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

function cssRuleBody(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*{([\\s\\S]*?)\\n}`));
  return match?.[1] ?? "";
}

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
    expect(cssRuleBody(scheduleStyles, ".schedule-scroll-area")).not.toMatch(
      /\s+padding:/,
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

  it("keeps schedule selected-date details directly below the selected date header", () => {
    expect(scheduleStyles).toMatch(
      /\.schedule-selected-events,\s*\.schedule-week\s*{[\s\S]*?align-content:\s*start;/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-selected-events\s*{[\s\S]*?align-self:\s*start;/,
    );
    expect(scheduleStyles).toMatch(
      /\.schedule-selected-events ol,\s*\.schedule-week-day ol\s*{[\s\S]*?align-content:\s*start;/,
    );
  });

  it("keeps selected-date schedule rows unframed", () => {
    const selectedEventRowStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-selected-events li",
    );

    expect(selectedEventRowStyles).not.toMatch(/\s+padding:/);
    expect(selectedEventRowStyles).not.toMatch(/\s+border:/);
    expect(selectedEventRowStyles).not.toMatch(/\s+border-radius:/);
  });

  it("lets the full week time range define scrollable height", () => {
    const weekTimeboardStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-timeboard",
    );
    const weekBodyStyles = cssRuleBody(scheduleStyles, ".schedule-week-body");

    expect(weekTimeboardStyles).toMatch(
      /grid-template-rows:\s*var\(--schedule-week-header-height\) auto;/,
    );
    expect(weekTimeboardStyles).toMatch(
      /height:\s*calc\(var\(--schedule-week-header-height\) \+ var\(--button-utility-height\) \+ \(18 \* var\(--schedule-week-hour-height\)\)\);/,
    );
    expect(weekTimeboardStyles).not.toMatch(/\s+overflow:\s*hidden;/);
    expect(weekBodyStyles).toMatch(
      /min-height:\s*calc\(var\(--button-utility-height\) \+ \(18 \* var\(--schedule-week-hour-height\)\)\);/,
    );
  });

  it("keeps week time-grid borders single and complete", () => {
    const weekHeaderSharedStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-time-gutter,\n.schedule-week-day-header",
    );
    const weekInteriorHeaderStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-day-header:not(:last-child)",
    );
    const weekGridStyles = cssRuleBody(scheduleStyles, ".schedule-week-grid-lines");
    const weekGridLastColumnStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-grid-lines span:nth-child(7n)",
    );
    const weekGridLastRowStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-grid-lines span:nth-last-child(-n + 7)",
    );
    const weekTimeColumnLastRowStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-time-column span:last-child",
    );

    expect(weekHeaderSharedStyles).not.toMatch(/\s+border-right:/);
    expect(weekInteriorHeaderStyles).toMatch(
      /border-right:\s*var\(--hairline-width\) solid var\(--hairline\);/,
    );
    expect(weekGridStyles).toMatch(
      /border-top:\s*var\(--hairline-width\) solid var\(--divider-soft\);/,
    );
    expect(weekGridLastColumnStyles).toMatch(/border-right:\s*0;/);
    expect(weekGridLastRowStyles).toMatch(/border-bottom:\s*0;/);
    expect(weekTimeColumnLastRowStyles).toMatch(/border-bottom:\s*0;/);
  });

  it("keeps the week timeboard unframed while preserving its full calendar sizing", () => {
    const weekTimeboardStyles = cssRuleBody(
      scheduleStyles,
      ".schedule-week-timeboard",
    );

    expect(weekTimeboardStyles).toMatch(/width:\s*100%;/);
    expect(weekTimeboardStyles).toMatch(/min-width:\s*960px;/);
    expect(weekTimeboardStyles).toMatch(/box-sizing:\s*border-box;/);
    expect(weekTimeboardStyles).not.toMatch(/\s+border:/);
    expect(weekTimeboardStyles).not.toMatch(/\s+border-radius:/);
  });
});
