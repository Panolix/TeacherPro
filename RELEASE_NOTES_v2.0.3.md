# TeacherPro v2.0.3

Quality-of-life release focused on the lesson plan canvas and a small UI fix.

## Added
- **Zoom controls for the lesson canvas.** New zoom cluster in the status bar when a lesson is open: `−` / percentage / `+`, plus a preset menu (Fit to width, 50%, 75%, 100%, 125%, 150%, 200%). Defaults to **Fit to width** so the paper always fills the available area nicely, whether the explorer is open or collapsed.
- **Keyboard shortcuts** for zoom: `Cmd/Ctrl + =` to zoom in, `Cmd/Ctrl + -` to zoom out, `Cmd/Ctrl + 0` to reset to Fit.

## Changed
- **Lesson paper is now px-locked to the PDF export width.** The canvas was previously sized in millimetres (`min(297mm, 100%)`), which caused it to silently squish below ~1123px of available width while the export still rasterised at 1062px — producing a subtle editor/export mismatch. The paper is now a fixed 1062px content width (matching the export's inner printable area) driven by a single CSS variable, so what you see is what you get in the PDF.
- **Header meta row** (Teacher / Created / Planned For / Subject) now sits on a predictable fixed-width page with consistent spacing regardless of window size.
- **Bigger screens** now benefit from Fit-to-width auto-scaling (capped at 150%) instead of being stuck at the old 1123px max — the paper feels appropriately sized on 1440p, 4K, and ultrawide displays.

## Fixed
- **Weekly calendar "Today" button** now shows proper hover and click feedback, matching the previous/next week buttons. Root cause: inline `style` was overriding Tailwind's hover utilities; fix uses the `!important` modifier so hover states reliably beat the default inline styles.

## Internal
- Single source of truth for paper dimensions via CSS variables (`--tp-export-content-w`, `--tp-paper-w`, `--tp-paper-h`). The PDF export now reads the content width from the same CSS variable instead of a hard-coded magic number.
- `@media print` rules neutralise the on-screen zoom so printing via the Windows fallback path always produces a true-size A4 page.
- New persisted UI settings: `lessonZoomMode` and `lessonZoomFixed`.
