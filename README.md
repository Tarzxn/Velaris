# Velaris — mesh and photo rebuild

An Ollama Cloud chat and file workspace for Render Free. This rebuild adds a CPU
mesh pipeline for printable models and organic figurines, photo imports, and
Cloudflare FLUX.2 klein 4B image generation/editing.

Start with [SETUP.md](SETUP.md). The source and sample models are ready to inspect;
deployment and live provider credentials still need to be configured in your account.

## What changed

- **Mesh creation:** smooth distance-field sculpting, indexed triangles, elliptical
  lofts, tapered capsules, and an editable human figurine. Accurate mechanical work
  can use the existing Manifold CAD booleans, sweeps, extrusion and revolution.
- **STL and GLB:** one build exports both; GLB uses metres/Y-up and includes vertex
  normals and a material. STL stays in millimetres/Z-up. Both open in the side panel.
- **Review and editing:** retain editable source, an independent validation report,
  and a four-view preview. Follow-up prompts include recent model source. Existing
  repair and vision-review passes now cover both formats and recheck a visual revision.
- **Complete builds:** a failed CAD child fails the whole model. Files and companion
  outputs are staged before publication. Invalid JSON/Python is rejected. ZIP bundles
  fail if a member fails, and oversized bundles/sheets are rejected rather than truncated.
- **File checks:** reopen Office files, check ZIP member integrity, parse PDF page
  streams, verify images, and independently reopen and check 3D exports. Spreadsheet
  formulas are preserved and marked for recalculation in Excel/LibreOffice.
- **Photos:** picker, drag/drop and paste, up to four images per message, removable
  thumbnails, server-side format/pixel/size validation, EXIF stripping, and vision
  observations for the planner. Reference photos can also be passed to image editing.
- **Images:** replace Pollinations with the official Cloudflare multipart API and
  a conservative shared cap of 50 attempts/day. No automatic paid fallback or retry.

The app does not promise perfect geometry, photorealistic humans, accurate photo
reconstruction, factual content, or flawless document layout. Geometry checks and
optional AI visual reviews are reported separately. Read the validation report and
inspect generated files before use.

## Files

| File | Purpose |
| --- | --- |
| `app.py` | Flask routes, chat streaming, source context, review/repair |
| `mesh_engine.py` | Bounded CPU sculpt/loft meshing, topology checks, STL/GLB I/O |
| `model_pipeline.py` | One model to verified exports, source, preview and report |
| `cad_engine.py` | Manifold CAD solids and CPU preview renderer |
| `uploads.py` | Temporary image-only imports and normalization |
| `image_provider.py` | Cloudflare image generation/editing and daily attempt cap |
| `artifacts.py` | Document/chart/archive generation and transactional publication |
| `model_instructions.py` | Updated modelling and file-production instructions |
| `build_model.py` | Rebuild saved JSON models without AI |
| `examples/` | Editable human and small coat-hanger programs |
| `tests/` | Unit and integration checks; live provider calls are mocked |

Code, ZIP and document uploads are intentionally deferred to the next import phase.
Generated code and ZIP downloads are still supported.

## Storage and credentials

Photos and generated files are temporary: two hours maximum, and possibly much less
on Render restart. Chat history is browser-local. Ollama/Cloudflare/Tavily keys stay
on the server. The original app has no account system, so users of the URL share
your quotas; the image cap is deployment-wide, not per person.

The full changes are in this folder; the original uploaded ZIP has not been modified.
