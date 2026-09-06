# Consolidated interface

The previous workspace redesign mixed the older compact controls with a new teal sidebar, oversized green result panel, rounded cards and promotional headings. This change replaces those competing treatments with one interface vocabulary.

- `src/app/interface.css` owns shared tokens. Existing Tailwind and `ds-*` utilities consume the same neutral surfaces, blue action color, 4px radius and 12/14/18/24px type scale.
- Controls use a 40px baseline. Page and panel spacing use 16px on mobile and 24px on desktop. Sidebar and section navigation use the same selected state.
- The overview presents four equal result columns, timeline values and editable assumption rows. All calculations and actions remain available; unsupported qualitative verdicts are removed.
- The editor, cash-flow forms, withdrawal planner, account menu and plan controls share readable labels and common controls. Dialog primitives retain fixed positioning and viewport scrolling.
- Chart bands use a blue scale. Compared plans retain distinct colors and line patterns; warning and error colors retain their meaning.

The React PDF renderer, simulation engine, taxes, persistence and authentication logic are unchanged. Shared browser styles also apply to setup and legacy HTML print pages; the downloadable React PDF report does not depend on them.

Validation: 711 unit tests, browser coverage for overview/editor/variants/cash flows/account menu, intermediate widths (768/820px) and narrow screens (320/390px), lint, TypeScript and production build. See PR checks for final results.
