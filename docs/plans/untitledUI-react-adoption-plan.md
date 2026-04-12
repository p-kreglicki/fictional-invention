# Untitled UI React adoption plan for Exercise Maker

## Summary
Use the existing app as the base and follow Untitled UI’s existing-project path, not `init --nextjs`. The repo is already compatible on the main versions that matter: Next.js App Router, React 19, TypeScript 5, and Tailwind CSS v4. The gap is foundation setup, not framework mismatch.

References:
- [Introduction](https://www.untitledui.com/react/docs/introduction)
- [Installation](https://www.untitledui.com/react/docs/installation)
- [Next.js integration](https://www.untitledui.com/react/docs/integrations/nextjs)
- [CLI](https://www.untitledui.com/react/docs/cli)

## Key changes
- Add Untitled UI’s required runtime dependencies: `@untitledui/icons`, `react-aria-components`, `tailwindcss-react-aria-components`, `tailwind-merge`, `tailwindcss-animate`, plus `next-themes` for the Next.js integration layer.
- Replace the current minimal Tailwind setup in [src/styles/global.css](/Users/piotrkreglicki/Projects/exercise-maker/src/styles/global.css) with Untitled UI’s theme/plugin structure:
  - import a new `theme.css`
  - register `tailwindcss-animate` and `tailwindcss-react-aria-components`
  - add the custom variants/utilities Untitled UI expects
  - apply the global typography/body rules that use the library’s font tokens
- Add Untitled UI’s Tailwind theme tokens in a new `theme.css`, then map the chosen brand palette there rather than scattering color overrides through components.
- Update [src/app/[locale]/layout.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/layout.tsx) to:
  - load `Inter` via `next/font/google`
  - install Untitled UI’s `ThemeProvider`
  - install a `RouteProvider` for React Aria navigation
  - keep `NextIntlClientProvider` and `PostHogProvider`, but place them inside the new app shell so all migrated components get routing/theme context
- Add the shared utility layer Untitled UI components rely on, especially a `cx`/`cn` helper backed by `tailwind-merge`. Do this once and keep all imported components aligned to that utility.
- Do not use `npx untitledui init --nextjs`; that is for new projects. For this repo, use `npx untitledui add ...` only for free primitives that are actually needed, then compose pages locally.

## Application plan
- Build the shared design foundation first:
  - app shell/header/navigation
  - buttons, inputs, textareas, tabs, badges, select/dropdown, modal/dialog, table/list primitives
  - icon usage through `@untitledui/icons`
- Migrate the layout layer next:
  - replace the current boilerplate-style `BaseTemplate` shell and nav with an Untitled-style marketing shell
  - replace the dashboard shell in the auth area with the same visual system so dashboard, content, exercises, and progress stop diverging
- Migrate feature screens after the shell is stable:
  - content flow: `DocumentUploadPanel`, `DocumentsLibrary`, delete dialog, add-content modal
  - dashboard overview: hero, stat cards, CTA group, empty/loading/error states
  - progress and exercises: filters, cards, list/table structures, status chips, generators, response panels
- Keep data contracts unchanged during the UI migration. The adoption should be presentational first: APIs, route structure, locale handling, and validation schemas stay as-is unless a component integration forces a small adapter.
- Update [`.storybook/preview.ts`](/Users/piotrkreglicki/Projects/exercise-maker/.storybook/preview.ts) so stories render under the same global CSS and new providers. If migrated components need router/theme context, add one shared Storybook decorator instead of per-story wrappers.
- Add a shared UI test render wrapper so component tests stop duplicating provider setup as Untitled UI primitives are introduced.

## Public interfaces and integration details
- New app-level providers become part of the UI contract:
  - `ThemeProvider` for color-mode/class management
  - `RouteProvider` for React Aria link/navigation behavior
- Inference from the repo: the `RouteProvider` should use the app’s locale-aware navigation adapter, not raw `next/navigation`, because this app routes through `next-intl` and uses locale-prefixed URLs.
- The shared style contract changes from “plain Tailwind utilities only” to “Tailwind v4 + Untitled UI theme tokens + React Aria styling variants”.
- Migrated components should preserve existing props where possible so feature logic and tests remain stable.

## Test plan
- Run targeted UI tests for migrated components, especially:
  - modal open/close and focus return
  - tab switching in upload flows
  - form field rendering and validation states
  - locale-aware navigation links rendered through the route adapter
- Add or update Storybook stories for the new shared primitives and the migrated dashboard/content surfaces.
- Run `npm test`, `npm run check:types`, and a focused Storybook/Vitest pass for the affected UI files.
- Do one browser verification pass for:
  - marketing home
  - dashboard overview
  - content upload flow
  - exercises flow
  - progress flow
  - mobile and desktop breakpoints
- Verify Clerk-hosted auth pages still render correctly inside the new surrounding shell.

## Assumptions and defaults
- Scope assumes `Free only` Untitled UI usage. No PRO examples or authenticated CLI flows are part of the plan.
- Scope assumes a broad migration, but implemented in phases: foundation first, then shell, then feature screens.
- Clerk auth surfaces remain Clerk-rendered. The plan only aligns their surrounding layout and appearance unless you later choose to replace or deeply theme Clerk’s hosted components.
- Because the repo already has a dirty worktree, implementation should be done in small, reviewable commits and avoid bulk-generated imports of unused Untitled UI components.
