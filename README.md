# Velaris (Gen 2)

Velaris is a Flask-based AI build workspace with a ChatGPT-style chat interface: describe what you need, watch the reply stream live, then download generated files as a ZIP. It runs on **Ollama Cloud** for text/code, **Pollinations.ai** for images, and optionally **Tavily** for live web search. Velaris opens directly into the assistant; there is no account or login layer.

## Look and feel

The UI uses a "liquid glass" style: translucent, blurred panels (sidebar, header, composer, message bubbles, code blocks, file cards, the assistant card) floating over an animated, colorful blurred backdrop, each with a soft specular highlight along its top edge.

## Chat architecture

- **Real token streaming.** Replies appear live, word by word, as the model generates them — Velaris incrementally decodes the `"reply"` field straight out of the model's still-in-progress JSON output (a small custom streaming-JSON-string parser), so you see text immediately instead of waiting for the whole generation (which, for a file-heavy request, can take a while). Verified correct against Python's own JSON decoder across chunk boundaries that split mid-escape-sequence, mid-unicode-escape, and mid-key.
- **Power level** (Low/Medium/High/Max, in the composer) controls how much reasoning effort the model spends before answering, mapped to Ollama's native "think" parameter plus a scaled token budget — the model's reasoning streams live as a collapsible "Thinking…" trace above the reply. 3D-modeling requests are detected automatically and forced to the strongest available model at Max effort regardless of the selected model/power, since build quality there is directly limited by model capability.
- **Stop generating** mid-stream — the send button becomes a Stop button; any text that had already streamed in is kept rather than thrown away.
- **Regenerate** any assistant reply (not just the latest) — drops it and everything after it, then re-asks the same prompt.
- **Copy buttons** on individual code blocks and on whole replies.
- **Rich Markdown rendering** — headings, bulleted/numbered lists, blockquotes, links, bold/italic, and syntax-styled code blocks.
- **Automatic retry** for transient upstream failures (a 502/503/504 or dropped connection from Ollama Cloud gets one quick retry before surfacing an error), and a single bad file in a response never discards the rest of a good reply — each file, and each step of a 3D build program, is attempted independently.

## Access

Velaris is open-access: it launches directly into the assistant. There is no login, signup, password, account database, session token, cookie, or GitHub Gist account store.

## What it can build

- Code and text files, `.docx`, `.xlsx`, `.pptx`, `.pdf` — each with real formatting: `.docx`/`.pdf` understand a Markdown-lite subset (`#`/`##`/`###` headings, `- ` bullets, `**bold**`, and `| a | b |` tables with a `|---|---|` separator row render as real formatted tables — grid tables with a bold header row in Word, aligned columns in PDF), `.xlsx` gets a bold auto-width header row with the top row frozen, and `.pptx` splits multi-line bodies into proper bullet points.
- **Images** — raster PNG/JPG via a free, keyless call to Pollinations.ai, with optional aspect-ratio control (`square`/`portrait`/`landscape`), or vector `.svg` written directly as text. Generated images/SVGs get an inline thumbnail gallery in chat.
- **Data charts** — real bar/line/pie/scatter charts rendered from actual numbers via matplotlib (not an AI-generated approximation of a chart). Distinct from "image": use this when the user wants their data plotted accurately.
- **3D models (.stl)** — a real parametric CAD-lite engine. The model is asked to reason like an engineer: write a design "plan" (what parts, roughly what size, how they connect) before an ordered build program ("ops") of primitives — box, sphere, cylinder, cone, torus, a genuinely hollow **tube** (pipe/ring/washer), a **capsule** (pill/rounded-rod shape with true hemispherical caps), a **wedge** (ramp/roof), and pyramid — each with position/rotation/scale. A box can also have a **bore**: a real round hole drilled straight through it along any axis (mounting holes, screw holes, cable pass-throughs) — built with an explicit, hand-verified construction (not a general boolean engine; see below) and confirmed watertight and geometrically hole-correct via ray-casting for every axis. `repeat` creates radial or linear patterns (gear teeth, table legs, fence posts, fins, stair treads, a row of mounting holes); `mirror` reflects a part across an axis-aligned plane for symmetric designs (wings, hull halves, paired brackets) without describing both sides by hand. Segment counts auto-scale with part size for smooth curves. Every op runs independently — a malformed step is skipped with a warning instead of failing the whole model. Every individual primitive (including a bored box) ships tested watertight (manifold — every edge shared by exactly two triangles) with outward-facing normals, and the reply includes the model's overall size (bounding box) and triangle count.

  *A note on what this isn't*: there's deliberately no general boolean subtract/union/intersect between arbitrary shapes. A first attempt at one (a standard BSP-tree mesh-boolean algorithm) was built and then removed after testing — with a watertightness checker and ray-casting, not just eyeballing it — found it produced subtly self-intersecting geometry on realistic (non-trivially-aligned) shapes, which is worse than not having the feature. So a multi-part model is an *assembly* of independently-solid pieces, not one fused manifold — each piece prints/renders fine on its own, and two pieces positioned to touch or overlap (like a bracket's two plates meeting at a joint) will generally look and 3D-print correctly since slicers merge touching/overlapping solids on their own, but the combined file isn't guaranteed to pass a strict single-manifold check exactly at that seam.

  A **Power** selector (Low/Medium/High/Max, next to the composer) controls how much reasoning effort the model spends before answering — mapped to Ollama's native "think" parameter — and 3D-modeling requests are detected automatically and forced to the strongest available model at Max effort regardless of what's selected, since geometry quality is the one output type here where model capability is the main limiting factor. The model's reasoning streams live as a collapsible "Thinking…" trace above the reply.
- **Live web research** — an optional "🔎 Web search" toggle in the composer runs the request through Tavily first and feeds the results to the model as context. Off by default; only enabled if `TAVILY_API_KEY` is set.
- Arbitrary base64 binary payloads for anything else.
- Plain-text answers with no files render as ordinary chat replies.

All generated paths are restricted to a per-request workspace and delivered as a ZIP, with individual files also downloadable (or, for images/SVGs, previewable) on their own.

## Interface

The UI is modelled on ChatGPT (chat) and Codex (builds), with dark/light/system themes:

- **Sidebar:** new chat, search, history grouped Today / Yesterday / Previous 7 days…, rename and delete, collapsible (drawer on mobile). `Ctrl/Cmd+K` searches, `Ctrl/Cmd+Shift+O` starts a new chat.
- **Composer:** centred on a fresh chat, docks to the bottom once you start; **+** menu toggles *Web search* and *Build files* (Codex mode); Enter sends, Shift+Enter adds a line, the send button becomes **Stop** while generating.
- **Replies:** streamed Markdown with tables, nested lists, syntax-highlighted code and Copy buttons; collapsible *Thought for Ns* and *Worked for Ns* steps; copy / 👍 / 👎 / regenerate; double-click your own message to edit and resend.
- **Model picker:** top-left, with reasoning effort (Low–Max). Models come from Ollama Cloud only (see Models).
- **Files panel (Codex-style):** click any generated file to open it beside the chat — live sandboxed **HTML preview**, code view, Word/Excel/PowerPoint previews, PDF viewer, images, ZIP contents, and an interactive **WebGL 3D viewer** for STL models (drag to rotate, scroll to zoom).

Chats are stored in this browser's `localStorage` only (clear them from the profile menu). Generated files stay on the server for 2 hours, after which their cards show as expired. `/api/inspect/<id>/<file>` provides the structured previews.

## 3D modelling (CAD engine)

`cad_engine.py` runs a real solid-modelling kernel ([Manifold](https://github.com/elalish/manifold), via `manifold3d`). The model writes a JSON CSG tree and Velaris evaluates it exactly:

- **Shapes:** box, rounded_box, plate (rounded-corner slab), sphere, cylinder/cone, tube, torus, capsule, wedge, pyramid, prism, gear, star, **text** (real 3D lettering), `extrude` (any 2D outline with holes, twist, taper, rounded corners), `revolve` (lathe profiles), **path** (smooth swept wire for handles, hooks, rails) and **spring**.
- **Operations:** union, difference, intersection, hull, **round** (exact fillets), **chamfer**, **shell** (uniform walls, open on any side), radial/linear `repeat`, `grid`, `mirror`.
- **Tolerant input:** common schema slips (`type`, `diameter`, `dimensions`, `pos`, `components`, string numbers, a list as the tree…) are understood rather than rejected.
- **Verified output:** a binary STL that is watertight by construction and independently re-checked (closed surface, outward faces, positive volume), centred and set on the build plate, with printability notes (wall thickness, bed size, disconnected pieces).
- **Preview sheet:** a smooth-shaded isometric view plus front / right / top views with overall dimensions, shown in chat, and an interactive WebGL viewer in the files panel.
- **Self-correction:** a failed or flawed build goes back to the model with the exact error; if that doesn't fix it, a *different* model gets a turn. Then a multimodal model (Gemma 4, free) looks at the rendered sheet and, if it spots a real defect (missing part, floating part, wrong proportions), the model revises the program once. All steps stream as progress in the UI.
- If `manifold3d` can't be installed, the older primitive-assembly STL engine is used.

## Models

Ollama Cloud models change often, so Velaris asks Ollama which models exist (`/api/tags`, cached 10 minutes) and shows only those it can use:

- **GPT-OSS 120B** (default) and **20B** — the proven baseline.
- **Free-tier extras when listed:** NVIDIA Nemotron 3 Ultra (most capable free model; used automatically for 3D builds), Nemotron 3 Super, and Gemma 4 31B (multimodal; used for the visual review of 3D models).
- Paid-plan families (Kimi, GLM, MiniMax, Qwen Coder, DeepSeek) are hidden unless you set `VELARIS_SHOW_PAID_MODELS=1`.

If a chosen model is retired, paid-only or rate-limited, the request is retried automatically on a proven free model. Only models from Ollama's cloud API are ever used (never a local daemon), and the server accepts only ids from its own catalogue.

Environment variables: `VELARIS_DEFAULT_MODEL`, `VELARIS_BEST_MODEL` (3D builds), `VELARIS_VISION_MODEL`, `VELARIS_VISION_CRITIC=0` (turn the visual review off), `VELARIS_SHOW_PAID_MODELS=1`, `VELARIS_RATE_LIMIT_PER_MIN`.

## File production

All file creation lives in `artifacts.py`; every file is written, then **re-opened with the matching library** (python-docx, openpyxl, python-pptx, Pillow, zipfile, a PDF trailer check, an STL facet check) before it is offered for download, and a failed file never leaves a partial artifact behind.

- **DOCX / PDF** — Markdown: headings, nested bullets, numbered lists, bold/italic/code/links, quotes, rules, code blocks, aligned tables, page numbers.
- **XLSX** — one or many sheets, real numbers/percentages/currency/dates, safe live formulas, styled frozen header, auto-width columns.
- **PPTX** — 16:9 deck with title/section/content/table slides, auto-fit and overflow splitting, speaker notes, slide numbers.
- **Charts** (matplotlib), **images** (Pollinations), **SVG** (sanitised), **ZIP bundles**, **STL** models, text/code of any kind.
- If the model returns prose instead of the JSON format, or a requested file fails, Velaris builds the requested DOCX/PDF/PPTX/XLSX from the written answer instead of leaving you with nothing.

## Run locally

1. Install Python 3.12+.
2. Create a virtual environment and install dependencies: `pip install -r requirements.txt`.
3. `export OLLAMA_API_KEY=...` (and optionally `TAVILY_API_KEY`), then `python app.py` or `gunicorn app:app`.
4. `GET /healthz` reports whether the key is configured.

## Deploy to Render

Push this directory to a Git repository and create a Render Blueprint from it (or a Python Web Service with the commands in `render.yaml`) — this now works fully on the **free plan**, no paid disk required. Set `OLLAMA_API_KEY` as a non-synced secret in `render.yaml`. `TAVILY_API_KEY` is optional for web search. `render.yaml` and `gunicorn.conf.py` both set a longer worker timeout (420s) since Ollama Cloud generations — especially file-heavy ones — routinely exceed gunicorn's 30s default, and use threaded (`gthread`) workers so one process can serve several concurrent streaming chats instead of a single request occupying a whole worker.


## Security and privacy

The Ollama Cloud key is **never** stored in the source: set `OLLAMA_API_KEY` as an environment variable (Render: Environment tab, non-synced). If a key was ever committed to a public repo, rotate it at https://ollama.com/settings/keys.

Velaris is open-access (no login), so anyone with the URL spends your Ollama quota. Built-in protections: a per-IP rate limit (`VELARIS_RATE_LIMIT_PER_MIN`, default 12, `0` disables), a 20,000-character prompt cap, history sanitising (only user/assistant turns are accepted from the browser), a server-side model allow-list, inline previews restricted to sandboxed images, and sanitised SVG. Put it behind your own auth or a private URL if it is deployed publicly.

Chat history is kept in your browser's localStorage (never on the server). Prompts and generated content go to Ollama Cloud (text), Pollinations.ai (image prompts) and, only when the toggle is on, Tavily (your search query) — don't enter credentials or regulated data. Workspaces live on the server's ephemeral disk, are pruned after 2 hours, are reachable only via an unguessable 128-bit ID, and are not encrypted at rest.
