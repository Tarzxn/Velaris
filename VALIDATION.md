# Validation of this rebuild

Prepared 15 October 2026. This records the local checks, not a production sign-off.

Packaging cleanup: prebuilt sample exports/previews and Python caches were removed.
Editable JSON examples remain. The viewer test now creates temporary loft/sculpt
fixtures itself, and both parser checks pass without bundled sample binaries.
The obsolete primitive STL engine was removed; shared path validation now lives
in `path_utils.py`.

## Results

- Python suite: **47 tests discovered; 37 passed, 10 skipped** for unavailable local dependencies.
- JavaScript syntax check passed.
- The actual STL/GLB JavaScript parsers were run in Node against both exported
  sample models: triangle counts and bounds agree, and all positions/normals are finite.
- Human: **88,788 triangles**, one closed shell, approximately
  **85.47 × 26.43 × 179.48 mm**. Both exports were independently reopened and checked.
- Small coat hanger: **50,476 triangles**, one closed shell, approximately
  **176.64 × 6.79 × 83.43 mm**. Both exports were independently reopened and checked.
- Four-view preview images of both samples were visually inspected. The hanger
  has a triangular frame and open hook. The human is a simplified figurine.
- Word paragraphs/tables, PDF page text including Unicode, spreadsheet numeric
  types/leading-zero IDs/formulas, and slide tables/notes survived reopen tests.
- Broken JSON/Python, invalid ZIP members/traversal, and failed models leave no
  published partial files. Uploaded images normalize correctly; invalid/expired
  inputs are rejected. Concurrent image-budget reservations respect their cap.
- Cloudflare requests were tested with mocked responses: multipart input, image
  references, base64 output, missing credentials, and rate-limit behavior. No live
  provider request or account charge was made.

## What did not run here

The environment does not have Flask, Manifold, matplotlib, or standalone requests.
Network permission to install missing dependencies was not granted. Local tests
used pip's bundled requests implementation only as a test-environment substitute;
the shipped application imports the normal dependency from `requirements.txt`.

The skipped tests are six Flask route/stream integration tests, three native
Manifold CAD integration tests, and one matplotlib chart test. A GitHub Actions
workflow is included to install the real dependencies and run the complete suite.
That workflow has been prepared but has not run in your GitHub account.

Browser UI verification could not proceed because the browser permission gate
rejected opening the localhost preview. Only static JavaScript checks and pure
binary-parser execution completed; no successful browser rendering is claimed.

No Render deployment, live Ollama generation, live Cloudflare generation/edit,
physical slicing/printing, or Office application rendering was performed here.
The build must pass the included full tests and the setup guide's deployment
checks before relying on it as a live service.

## Quality boundaries

Closed and consistently oriented triangle meshes can still have self intersections,
thin regions, unsupported overhangs or imperfect resemblance. The report lists
those unchecked properties explicitly. A CPU procedural human does not match a
high-resolution scan, and photo observations are not full 3D reconstruction.

Office/PDF structural checks do not establish factual accuracy or impeccable
layout. Spreadsheet formulas are not evaluated server-side; opening the workbook
in Excel/LibreOffice triggers recalculation. Review all generated files in their
intended applications.
