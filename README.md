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

## Models

Velaris deliberately sticks to Ollama's own `gpt-oss` family rather than third-party cloud models (Qwen, DeepSeek, etc.) whose Ollama Cloud offerings churn heavily — DeepSeek's alone has been retired and replaced multiple times (v3.1 → v4-flash → v4-pro) in the time this app has existed. `gpt-oss` has stayed stable:

- **GPT-OSS 20B** (default) — fast, capable, and the best balance of speed vs. quality for interactive use.
- GPT-OSS 120B — larger, slower, stronger reasoning; also what Velaris auto-switches to for 3D-modeling requests (see below).

## Run locally

1. Install Python 3.12+.
2. Create a virtual environment and install dependencies: `pip install -r requirements.txt`.

## Deploy to Render

Push this directory to a Git repository and create a Render Blueprint from it (or a Python Web Service with the commands in `render.yaml`) — this now works fully on the **free plan**, no paid disk required. Set `OLLAMA_API_KEY` as a non-synced secret in `render.yaml`. `TAVILY_API_KEY` is optional for web search. `render.yaml` and `gunicorn.conf.py` both set a longer worker timeout (420s) since Ollama Cloud generations — especially file-heavy ones — routinely exceed gunicorn's 30s default, and use threaded (`gthread`) workers so one process can serve several concurrent streaming chats instead of a single request occupying a whole worker.


## Security and privacy

**The Ollama Cloud API key is currently hardcoded as the default value in `app.py`, at the person's explicit request, so the app runs without extra setup.** This is fine for personal/local use but means anyone with access to this source (e.g. if pushed to a public repo) can read and use the key. Before deploying anywhere shared or public, either remove the hardcoded default and require `OLLAMA_API_KEY` to be set, or rotate the key at https://ollama.com/settings/keys if it's ever exposed. The key is never sent to or stored in the browser — only the server holds it. Prompts and generated content are sent to Ollama Cloud (text), Pollinations.ai (image prompts), and — only when you enable the toggle — Tavily (your search query), so do not enter credentials, private keys, regulated data, or sensitive files unless you've reviewed each provider's retention/privacy terms. Workspaces are stored only on the server's ephemeral local disk, pruned automatically after 2 hours, and reachable through the unguessable 128-bit workspace ID — but they are not encrypted at rest.
