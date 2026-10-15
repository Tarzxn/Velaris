# Deploy the rebuild on Render Free

Replace your repository contents with this folder's contents (including `static`,
`templates`, and `.github`). Keep your existing Render service and environment
variables. Do not put API keys into JavaScript, GitHub, or chat messages.

## Render settings

| Setting | Value |
| --- | --- |
| Runtime | Python 3 |
| Plan | Free |
| Build command | `pip install -r requirements.txt` |
| Start command | `gunicorn app:app` |
| Health check | `/healthz` |

`gunicorn.conf.py` sets one process with threaded requests. Artifact builds are
serialized within that process to limit memory use. `render.yaml` also configures
the service and limits numerical-library threads. If configuring manually, set
`OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, and `MALLOC_ARENA_MAX=2`.

## Environment variables

| Name | Purpose |
| --- | --- |
| `OLLAMA_API_KEY` | Your existing Ollama Cloud key; required for chat and planning |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare's 32-character account ID; required for image generation |
| `CLOUDFLARE_API_TOKEN` | Server-side token created with Cloudflare's Workers AI token template |
| `TAVILY_API_KEY` | Optional web search, as in your original app |
| `VELARIS_VISION_MODEL` | Optional image-capable model ID available to your Ollama account; auto-selects a discovered Gemma 4 model otherwise |
| `VELARIS_BEST_MODEL` | Optional model ID from the discovered catalogue for 3D planning |

Use a **Cloudflare Workers Free** account/plan for the image API and do not enable
paid overages. Get the account ID from your Cloudflare dashboard and create a token
scoped to the intended account. Prefer **Workers AI → Use REST API → Create a Workers
AI API Token**. For a custom token, Cloudflare's guide requires both **Workers AI -
Read** and **Workers AI - Edit**. Restart Render after
adding environment variables. Cloudflare setup needs to be done in your own account;
no credentials are included in this download.

The endpoint is FLUX.2 klein 4B, using the documented multipart REST input. Default
output is 1024×1024; portrait is 768×1024 and landscape is 1024×768. Up to four
reference photos are resized to at most 504×504 for image editing. The original
vision-analysis copy is normalized to at most 1600×1600.

## Free image allowance: why 50 per day fits

Checked against Cloudflare's published pricing on 15 October 2026:

- Free allowance: 10,000 neurons/day, shared across the Cloudflare account's Workers AI usage.
- Klein 4B output: 26.05 neurons per 512×512 tile.
- A square 1024×1024 output: 4 tiles × 26.05 = **104.2 neurons**.
- Fifty outputs: **5,210 neurons**. Four small input photos per output add approximately
  1,074 neurons across 50 edits at the published 5.37 neurons per input tile.
- Velaris allows **50 generation attempts per UTC day**, shared by everyone using
  this deployment. Failed attempts count conservatively; the app does not retry
  automatically or call a paid fallback.

This is allowance arithmetic, not a guarantee of availability or 50 successful
images: other account usage, transient failures, rate limits, and provider changes
can reduce the number. Free-tier exhaustion produces an error. Keep the account on
Workers Free so that account-level limits also enforce your no-payment requirement.
The local SQLite attempt counter survives process restarts only while the disk is
preserved; Render can reset it. The provider's Free limit remains the final backstop.

Official sources:

- [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare token setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Klein 4B model](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/)
- [Multipart generation and reference inputs](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/)
- [Ollama vision inputs](https://docs.ollama.com/capabilities/vision)
- [Render Free limitations](https://render.com/docs/free)

## First checks after deploy

1. Open `/healthz`: `configured` should be true. This checks configuration presence,
   not account credentials or remaining quota.
2. Ask for a printable coat hanger. Open and rotate the STL and GLB, then download
   the model, source and validation report.
3. Ask for a human figurine, then “make the arms angle out more”. The previous
   `.model.json` should be supplied to the planner for the follow-up edit.
4. Use **+ → Attach photos**, paste an image, or drag images onto the composer. Ask
   about them. Use a small non-sensitive test photo first.
5. Ask to change the photo's background. The normalized references should reach
   Cloudflare; a missing key, quota issue, or invalid permission should give a clear error.
6. Request a Word report, PDF, spreadsheet with formulas, and slide deck. Open each
   in its normal application and review content/layout. Formulas calculate on opening.

## Local use and tests

```text
pip install -r requirements.txt
python -m unittest discover -s tests -v
node --check static/app.js
python -m flask --app app run
```

The included GitHub Actions workflow runs the Python suite with dependencies and
checks JavaScript syntax. It does not contact paid or live AI APIs.

To rebuild a saved model without any AI request:

```text
python build_model.py examples/human.model.json --output generated/human.stl
python build_model.py examples/coat-hanger.model.json --output generated/coat-hanger.glb
```

Each command creates STL, GLB, a preview, `.model.json`, and `-validation.json`.

## Limits that remain

Render Free has a shared CPU and 512 MB RAM. It sleeps after inactivity and loses
local files on restart/redeploy/spin-down. Photos and artifacts expire after two
hours or sooner when the disk is reset. Browser chat history is stored locally,
but retaining a chat does not retain its server files. Download files you need.

The procedural human is a figurine with approximate proportions, not a scanned,
photorealistic or medically accurate person. Photo references are analysed as
visible evidence; a single photo cannot establish hidden geometry or exact scale.
There is no GPU reconstruction service in this rebuild. Complex meshes can exceed
the bounded CPU budget and should fail with a repairable error.

Geometry checks establish finite coordinates, triangle integrity, closed edges,
consistent winding, positive volume, shell count, and export agreement. They do
not establish self-intersection freedom, minimum local thickness, load safety,
support strategy, exact resemblance, or a successful physical print. Review in
your slicer. Structural Office/PDF checks likewise do not prove factual accuracy
or flawless visual layout. See `VALIDATION.md` for what was actually tested here.
