# Feature request: "Export for proposal" command

## Problem

Today, PNG export (`exportCanvasAsPNG` in `src/lib/exportUtils.ts`) only exports
the *currently active* view, captures whatever is on screen (the
`.react-flow__renderer` element at its current pan/zoom), and defaults to a
dark/current-theme background. Building a client proposal deck requires
manually switching between views, exporting each one, framing the viewport by
hand so nothing is cropped, and renaming the downloaded files — a repetitive,
error-prone process that also produces inconsistent-looking images between
exports.

## Proposed solution

Add a dedicated "Export for proposal" command (e.g. from the command
palette/top pill, alongside existing PNG/SVG export) that produces a
consistent, ready-to-paste image package:

1. **View picker** — on invocation, show a picker listing the views available
   in the current workspace (System Context, Container, Component, Deployment,
   etc.) with checkboxes/multi-select for which ones to include.
2. **Batch PNG export** — export one PNG per selected view.
3. **Fixed, predictable look** — every exported PNG always uses:
   - light/white theme (reuse `LIGHT_STYLE` from `exportUtils.ts`), and
   - an opaque **white** background (`#ffffff`), never transparent or dark.
4. **Bounding-box framing, not viewport framing** — each image must be cropped
   to the diagram's actual content bounding box (all nodes/edges), not to
   whatever happens to be visible in the browser viewport at export time. This
   likely means computing the React Flow node/edge bounds (`getNodesBounds` /
   `fitView`-style bounds) and rendering/cropping to that rect instead of the
   live `.react-flow__renderer` element as-is.
5. **Deterministic file naming** — each file is named
   `<ProjectName>-<ViewName>.png` (e.g. `Acme-SystemContext.png`,
   `Acme-ContainerView.png`), reusing `sanitizeFilename` from
   `src/lib/filenames.ts`.
6. **Delivery** — download all selected images (individually or as a single
   zip) so they can be dropped straight into a proposal document.

## Alternatives considered

- Extending the existing single-view PNG export with a "light + white bg"
  toggle: doesn't solve the batch/multi-view or bounding-box-crop problems, so
  the manual, repetitive workflow remains.
- Exporting SVGs instead of PNGs: proposal documents (Word/Slides/PDF) handle
  PNGs more reliably than inline SVG; PNG also matches the existing export
  affordance users already know.

## Additional context

- Existing export code: `src/lib/exportUtils.ts`
  (`exportCanvasAsPNG`/`exportCanvasAsSVG`, `LIGHT_STYLE`, `bgForTheme`) and
  `src/lib/filenames.ts` (`sanitizeFilename`).
- Command entry points: `src/lib/commands.ts`.
- Current PNG export uses `html-to-image`'s `toBlob` against the
  `.react-flow__renderer` DOM node at `pixelRatio: 2` — the new command needs
  to constrain that capture (or post-crop it) to the diagram's content bounds
  rather than the rendered viewport.
