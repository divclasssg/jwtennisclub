<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

`docs/solutions/` contains documented solutions to past bugs, workflow issues, and implementation guardrails, organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). It is relevant when implementing or debugging in documented areas.

Before continuing product work, read `docs/PROJECT_CHECKLIST.md` and `docs/WORK_LOG.md` to preserve project context.

Style files should use SCSS. CSS Module class names should use meaningful kebab-case hyphen names such as `shell-nav-link` or `dashboard-metric-card`. Do not use BEM naming (`block__element--modifier`), camelCase class names, or arbitrary global prefixes.
<!-- END:nextjs-agent-rules -->
