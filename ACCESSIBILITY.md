# Accessibility

Target: WCAG 2.1 AA, in German and English, light and dark colour schemes, from 320 px phones to wide desktops.

## What the app does

- **Skip links** (`src/components/navigation/SkipLinks.tsx`) and a correct `<html lang>` per locale.
- **Workspace navigation**: the section index moves focus to the section heading and marks the link `aria-current`; the page jumps instantly when `prefers-reduced-motion` is set.
- **Edit panel** (`src/components/workspace/edit/EditPanel.tsx`, Radix dialog): focus moves to the panel title, Escape closes the layer that has focus and returns focus to the control that opened it; as an overlay, Tab cycles between the panel and the result bar only.
- **Cash-flow Sankey**: one tab stop, arrow keys between nodes, Enter opens and closes a group; nodes carry accessible names with their amounts.
- **Keyboard**: Cmd/Ctrl+S saves the working copy from anywhere; dialogs and menus unwind one Escape at a time.
- **Colour**: interface tokens in `src/app/interface.css` for both schemes (System/Light/Dark switch); the PDF report is always light.
- **Forms**: labelled inputs with linked help text; out-of-range values stay on screen with an explanation instead of being clamped silently.

## What is tested

| Check | Where |
| --- | --- |
| axe-core (WCAG 2.0/2.1 A and AA rules) on the edit panel and the levers group, at 1366 px and 390 px, light and dark | `tests/flow-switches.spec.ts` ("accessibility"), runs in every E2E run (`axe-core` devDependency) |
| Contrast of the text and graphic token pairs in both schemes | `src/lib/__tests__/contrast.test.ts` (Jest) |
| Focus handling of the edit panel, Escape layering, Tab containment, compare mode focus return, reduced motion | `tests/onepage.spec.ts` |
| Sankey keyboard model | `tests/cashflow-drilldown.spec.ts` |
| Accessible names of key controls (run button, section index, sliders), `<html lang>`, setup help text and progress | `tests/i18n.spec.ts`, `tests/workspace.spec.ts` |

CI runs all of these on Chromium; the iPad WebKit run is informational. Screen readers are not tested automatically — check VoiceOver/NVDA by hand for larger UI changes.
