"""Velaris (Gen 2) — an Ollama Cloud-powered, downloadable file workspace."""
import io
import shutil
import json
import mimetypes
import os
import re
import threading
import time
import uuid
import zipfile
from collections import defaultdict, deque
from pathlib import Path

import requests
from flask import Flask, Response, abort, jsonify, render_template, request, send_file, stream_with_context

import artifacts as art  # all file production (docx/pdf/xlsx/pptx/chart/image/svg/zip/stl) + validation
from stl_engine import safe_path

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
WORKSPACES = Path(os.environ.get("WORKSPACE_DIR", "data/workspaces"))
WORKSPACES.mkdir(parents=True, exist_ok=True)
WORKSPACE_MAX_AGE_SECONDS = 2 * 60 * 60  # ephemeral disk: prune old workspaces so it never fills up

# Single server-side token for Ollama Cloud (https://ollama.com). Never hardcoded:
# set OLLAMA_API_KEY in the environment (Render: Environment tab).
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "").strip()
OLLAMA_CHAT_URL = "https://ollama.com/api/chat"
OLLAMA_TAGS_URL = "https://ollama.com/api/tags"

# Tavily — optional live web search. Set TAVILY_API_KEY to enable the toggle.
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "").strip()
TAVILY_SEARCH_URL = "https://api.tavily.com/search"

IMAGE_EXTENSIONS = art.IMAGE_EXTENSIONS

# ---- Model catalogue ---------------------------------------------------------
# Ollama retires and replaces cloud models regularly, so Velaris asks Ollama
# Cloud what is actually available (/api/tags, cached) and only offers models
# that exist right now. gpt-oss stays as the always-works baseline; newer
# families are offered when present. Override defaults with env vars.
BASE_MODELS = [
    {"id": "gpt-oss:120b", "name": "GPT-OSS 120B", "family": "OpenAI OSS", "tag": "Recommended · strongest reasoning"},
    {"id": "gpt-oss:20b", "name": "GPT-OSS 20B", "family": "OpenAI OSS", "tag": "Fast · light tasks"},
]
# (name prefix, display family, tag) — checked against the live catalogue.
DISCOVERABLE_FAMILIES = [
    ("kimi-k2", "Moonshot Kimi", "Newer · strong at structured builds"),
    ("glm-5", "Zhipu GLM", "Newer · strong coding & documents"),
    ("minimax-m", "MiniMax", "Newer · long-form generation"),
    ("qwen3-coder", "Qwen Coder", "Code-focused"),
    ("deepseek-v", "DeepSeek", "Heavy · deep reasoning"),
]
MODEL_CACHE_SECONDS = 600
_model_cache = {"at": 0.0, "models": list(BASE_MODELS)}
_model_lock = threading.Lock()


def _pretty_model_name(model_id):
    base = model_id.split(":")[0].replace("-", " ").title()
    variant = model_id.split(":", 1)[1] if ":" in model_id else ""
    return f"{base} {variant}".strip().replace(" Cloud", "")


def get_models(force=False):
    """BASE_MODELS (filtered to what Ollama Cloud actually serves, when it can
    be reached) plus any newer families discovered live."""
    now = time.time()
    with _model_lock:
        if not force and now - _model_cache["at"] < MODEL_CACHE_SECONDS:
            return list(_model_cache["models"])
    models = list(BASE_MODELS)
    if OLLAMA_API_KEY:
        try:
            response = requests.get(OLLAMA_TAGS_URL, headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"}, timeout=8)
            response.raise_for_status()
            names = [m.get("model") or m.get("name") or "" for m in response.json().get("models", [])]
            names = [n for n in names if n]
            if names:
                live = {n.removesuffix("-cloud"): n for n in names}  # normalised id -> exact id the API lists
                filtered = [{**m, "id": live[m["id"]]} for m in BASE_MODELS if m["id"] in live]
                models = filtered or list(BASE_MODELS)
                for prefix, family, tag in DISCOVERABLE_FAMILIES:
                    matches = sorted(n for n in names if n.startswith(prefix))
                    if matches:
                        mid = matches[-1]  # highest version string in the family
                        models.append({"id": mid, "name": _pretty_model_name(mid), "family": family, "tag": tag})
        except (requests.RequestException, ValueError, AttributeError):
            pass  # keep baseline catalogue; a failed lookup must never break chat
    with _model_lock:
        _model_cache.update(at=now, models=models)
    return list(models)


def default_model_id():
    wanted = os.environ.get("VELARIS_DEFAULT_MODEL", "").strip()
    ids = [m["id"] for m in get_models()]
    if wanted and wanted in ids: return wanted
    return ids[0]


def best_model_id():
    wanted = os.environ.get("VELARIS_BEST_MODEL", "").strip()
    ids = [m["id"] for m in get_models()]
    if wanted and wanted in ids: return wanted
    big = [i for i in ids if i.startswith("gpt-oss:120b")]
    return big[0] if big else ids[0]


# ---- Power level (Low/Medium/High/Max reasoning effort) ----------------------
# gpt-oss takes "low"/"medium"/"high" for `think`; other model families take a
# boolean. num_predict is a SHARED budget for reasoning + answer, so it is
# sized with headroom for both a reasoning trace and a full multi-file answer.
POWER_LEVELS = {
    "low":    {"think": False,    "num_predict": 4096},
    "medium": {"think": "low",    "num_predict": 8192},
    "high":   {"think": "medium", "num_predict": 14336},
    "max":    {"think": "high",   "num_predict": 22528},
}
DEFAULT_POWER = "medium"
UPSTREAM_TIMEOUT = {"low": 180, "medium": 260, "high": 340, "max": 380}


def think_value(model_id, config):
    """gpt-oss understands effort levels; every other family only on/off."""
    value = config["think"]
    if model_id.startswith("gpt-oss"):
        return value
    return bool(value)


_3D_REQUEST_PATTERN = re.compile(
    r"\b(3d|three[\s-]?dimensional|stl|cad|\bprint(?:able|ed)?\b.*\b(model|part|object|design)|"
    r"model.*\bprint\b|design.*\bprint\b|mount(?:ing)?\s*bracket|\bbracket\b|\bfigurine\b|\bmini(?:ature)?\b|"
    r"\bsculpt|\bmesh\b|\bmold\b)\b", re.IGNORECASE)


def looks_like_3d_request(prompt):
    """Auto-select the strongest model + max effort for 3D requests, where
    model capability directly limits geometry quality."""
    return bool(_3D_REQUEST_PATTERN.search(prompt))


# ---- Light per-IP rate limit (the app is open-access and spends your key) -----
RATE_LIMIT = int(os.environ.get("VELARIS_RATE_LIMIT_PER_MIN", "12"))
_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_limited(ip):
    if RATE_LIMIT <= 0: return False
    now = time.time()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > 60: q.popleft()
        if len(q) >= RATE_LIMIT: return True
        q.append(now)
        if len(_hits) > 5000:
            for k in [k for k, v in _hits.items() if not v]: _hits.pop(k, None)
    return False


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    return (forwarded.split(",")[0].strip() if forwarded else request.remote_addr) or "?"


SYSTEM = '''You are Velaris, an expert software and artifact builder. Turn the request into a concise response plus real, complete files. Respond with ONLY valid JSON, no prose before or after it, no markdown code fences, using this schema:
{"reply":"short helpful Markdown response","files":[{"path":"safe relative filename.ext","kind":"text|docx|xlsx|pptx|pdf|stl|image|chart|zip|base64","content":"content for artifact"}]}
Every string must be valid JSON (escape quotes and newlines). Create useful, complete, finished files — never placeholders, never "TODO", never "content goes here". Use a descriptive filename (e.g. "q3-sales-report.docx"), never "generation.md"/"output.md"/"document.md".

Kinds:
- text: code, HTML, CSS, JS, JSON, CSV, Markdown, plain text, and SVG vector graphics (a complete <svg ...>...</svg> with a viewBox). Put raw file text in content, no code fences.
- docx and pdf: content is Markdown. Supported: "# ", "## ", "### " headings, paragraphs separated by blank lines, "- " bullets (indent 2 spaces to nest), "1. " numbered lists, **bold**, *italic*, `code`, [links](https://...), > quotes, --- rules, fenced code blocks, and tables written as | a | b | with a |---|---| separator row (use :---: / ---: for alignment). Start with a "# Title". Write substantive, well-structured prose, not an outline.
- xlsx: content is JSON. One sheet: [["Header1","Header2"],["text",12.5],["Total","=SUM(B2:B10)"]]. Several sheets: {"sheets":[{"name":"Summary","rows":[[...]]},{"name":"Data","rows":[[...]]}]}. First row is the header. Send numbers as JSON numbers, percentages as "12%", money as "$1,200.00", dates as "2026-03-31", and real Excel formulas as strings starting with "=" when totals/derived values are wanted.
- pptx: content is a JSON list of slides: [{"layout":"title","title":"Deck title","subtitle":"Speaker · date"},{"layout":"section","title":"Part one"},{"title":"Slide title","bullets":["short point","another point"],"notes":"speaker notes"},{"title":"Comparison","table":[["Plan","Price"],["Pro","$20"]]}]. Use 1 title slide first, then 5-12 content slides with 3-6 concise bullets each (under ~15 words per bullet). "body" with one bullet per line is also accepted.
- image: a raster picture (.png/.jpg) generated from a prompt. content is a vivid, specific English prompt, or {"prompt":"...","aspect":"square|portrait|landscape"}. For logos, icons, diagrams and anything that must be exact, prefer SVG via kind "text" instead.
- chart: a real chart from real numbers, path ending .png. content is JSON: {"type":"bar|line|pie|scatter","title":"...","x_label":"...","y_label":"...","labels":["A","B","C"],"series":[{"name":"Series 1","values":[1,2,3]}]}.
- zip: a bundle. content is a JSON list [{"path":"src/app.py","kind":"text","content":"..."}, ...] of any non-zip kinds. Use zip only when the user asks for an archive; otherwise list the files separately.

For a 3D model, use kind "stl" with a .stl path. Take real time to think this through — you are the CAD engineer: mentally model the object as an assembly of real, distinct parts and their spatial relationships before writing anything. content is JSON describing a BUILD PROGRAM that Velaris parses and executes step by step:
{"plan":"a few sentences: what real-world parts does this object have, roughly what size is each, and how do they connect/align?","ops":[
  {"op":"add","shape":"box|sphere|cylinder|cone|torus|tube|capsule|wedge|pyramid","size":20,"radius":10,"height":20,"tube":4,"segments":16,"position":[x,y,z],"rotation":[rx,ry,rz],"scale":[sx,sy,sz]},
  {"op":"repeat","count":6,"rotate":[0,0,60],"around":[0,0,0]}
]}
Shape params — "box": size [w,d,h] (or one number for a cube); optionally add "bore":{"axis":"x|y|z","radius":R,"segments":N} to punch a clean round hole straight through the box along that axis (e.g. a screw hole, a mounting hole, a cable pass-through, a pivot hole) — this is a real hole through solid material, not a decoration. "sphere"/"cylinder"/"cone": "radius" (+"height" for cylinder/cone). "torus": "radius" (ring) + "tube" (thickness). "tube": a hollow pipe/ring — "radius" (outer) + "inner_radius" + "height". "capsule": a pill shape — "radius" + "height" (straight section length; total length is height + 2*radius). "wedge": a ramp/doorstop/roof — size [w,d,h], sloped down along x. "pyramid": "size" (+optional "height"). "cylinder" with a low "segments" (e.g. 5, 6, 8) becomes a pentagonal/hexagonal/octagonal prism — use this for nuts, bolts, multi-sided posts, etc. instead of a separate prism shape. Leave "segments" unset to let Velaris auto-pick a smooth value from the part's size; only set it explicitly for a deliberately low-poly/faceted look.
Every shape is centered on its own local origin, then: scaled by "scale" [sx,sy,sz] (stretch into an ellipsoid, plank, etc.), rotated by "rotation" [rx,ry,rz] degrees (X then Y then Z, e.g. tilt a fin or lay a cylinder on its side), then moved to "position" [x,y,z]. All optional, default no scale/rotation, position [0,0,0].
"repeat" duplicates the shape from the immediately preceding "add" "count"-1 more times: "rotate":[rx,ry,rz] rotates each successive copy further around the "around" pivot (default world origin) — radial patterns (gear teeth, wheel spokes, flower petals, fins around a body). "translate":[dx,dy,dz] offsets each successive copy further along that vector — linear patterns (fence posts, stair treads, table legs, shelf slats, a row of mounting holes). Combine both for a spiral/helix.
"mirror" reflects the immediately preceding "add" across an axis-aligned plane through the origin (or through "offset" along that axis): {"op":"mirror","axis":"x|y|z","offset":0} — use for symmetric designs (matched wings, a hull's two sides, paired brackets) instead of specifying both halves by hand.
There is deliberately no general subtract/union/intersect between arbitrary shapes — Velaris tried a general boolean engine and it produced subtly broken (self-intersecting) geometry on realistic shapes during testing, so it was removed rather than shipped unreliable. Work within what's actually available: "bore" for holes through a box, "tube" for hollow cylinders/pipes/rings, overlapping "add"s for anything that reads fine as visually-merged solids (most non-precision parts don't need true CSG to look and print correctly).
Design like an engineer, not an illustrator: before writing ops, work out in "plan" what the real object is made of (its distinct functional parts), roughly how big each one is relative to the others, and exactly how they align and connect (shared axis, shared face, a specific offset) — vague ops with parts floating unconnected or wildly mismatched in scale are the main way these builds go wrong. Build real objects from several parts (roughly 6-20 ops is normal for something detailed) — e.g. a mug = a "tube" body + a "torus" or bent-"capsule" handle positioned at the side; a table = one flat box top + 4 cylinder legs via one add + one repeat with translate; a gear = a short cylinder body + one tooth box at its edge + a repeat rotating around the center; a rocket = a cylinder body + a cone nose + a capsule or sphere tip + fin boxes via one add + a radial repeat; a bracket = a box with a "bore" for its mounting hole. Prefer the shape that is actually hollow/rounded/holed when the real object is (a cup or pipe should be a "tube" not a solid cylinder; a pill or rounded handle should be a "capsule" not a box; a mounting plate should use "bore" not a solid slab). Keep coordinates within roughly -200..200. If one of your ops is invalid Velaris will skip just that piece and keep the rest, so don't let one uncertain part stop you from building the others.

When the user asks for a specific file format, use that exact extension and matching kind. If the request only needs a text answer, return an empty files list. Use base64 only for true binary payloads that fit no kind above. Never use absolute paths, traversal, or more than 50 files.'''


class ReplyStreamExtractor:
    """Incrementally decodes the "reply" string field out of a partial JSON
    buffer as it streams in from the model, token chunk by token chunk —
    without waiting for the whole (reply + files) JSON object to finish, so
    the person sees the chat text appear live instead of staring at a
    spinner for the full generation. Only ever emits fully-decoded
    characters (correctly unescaping \\", \\n, \\uXXXX, etc.); an incomplete
    trailing escape sequence is held back until more of the buffer arrives.
    If the model never emits a well-formed "reply" key, this simply never
    finds a start point and emits nothing — falling back to no worse than
    the old "type indicator until done" behavior."""

    _KEY_PATTERN = re.compile(r'"reply"\s*:\s*"')
    _SIMPLE_ESCAPES = {'"': '"', '\\': '\\', '/': '/', 'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f'}

    def __init__(self):
        self.buffer = ""
        self.reply_start = None
        self.emitted = ""
        self.finished = False

    def feed(self, chunk):
        if self.finished or not chunk:
            return ""
        self.buffer += chunk
        if self.reply_start is None:
            match = self._KEY_PATTERN.search(self.buffer)
            if not match:
                return ""
            self.reply_start = match.end()
        decoded, closed = self._decode_partial(self.buffer, self.reply_start)
        new_text = decoded[len(self.emitted):]
        self.emitted = decoded
        if closed:
            self.finished = True
        return new_text

    @classmethod
    def _decode_partial(cls, buf, start):
        out = []
        i, n = start, len(buf)
        while i < n:
            c = buf[i]
            if c == '"':
                return "".join(out), True  # unescaped closing quote — string is complete
            if c == '\\':
                if i + 1 >= n:
                    break  # incomplete escape at the buffer's end — wait for more to arrive
                nxt = buf[i + 1]
                if nxt in cls._SIMPLE_ESCAPES:
                    out.append(cls._SIMPLE_ESCAPES[nxt]); i += 2; continue
                if nxt == 'u':
                    if i + 6 > n:
                        break  # incomplete \\uXXXX — wait for more
                    try:
                        out.append(chr(int(buf[i + 2:i + 6], 16))); i += 6; continue
                    except ValueError:
                        i += 2; continue  # malformed escape — skip it rather than crash the stream
                out.append(nxt); i += 2; continue  # unrecognized escape — drop the backslash, keep the char
            out.append(c); i += 1
        return "".join(out), False  # ran out of buffer without hitting the closing quote yet


def repair_truncated_json(text):
    """Best-effort repair of a JSON document that got cut off mid-stream —
    e.g. the model hit its token budget before finishing. Walks the text
    tracking open strings/brackets, closes a dangling string, then appends
    whatever brackets are still open in the correct order. This turns a
    response that's genuinely truncated but otherwise complete (the common
    case — the model was on the last file when it ran out of room) into
    something parseable, instead of discarding the entire response."""
    text = text.rstrip()
    if not text: return text
    stack, in_string, escape = [], False, False
    for ch in text:
        if in_string:
            if escape: escape = False
            elif ch == "\\": escape = True
            elif ch == '"': in_string = False
        else:
            if ch == '"': in_string = True
            elif ch in "{[": stack.append(ch)
            elif ch in "}]" and stack: stack.pop()
    repaired = text.rstrip().rstrip(",") if not in_string else text
    if in_string:
        if repaired.endswith("\\"): repaired = repaired[:-1]  # drop a dangling escape char
        repaired += '"'
    for opener in reversed(stack):
        repaired += "}" if opener == "{" else "]"
    return repaired


def salvage_truncated_json(text):
    """Truncation can land mid-key or right after a comma, where simply closing
    brackets still isn't valid JSON. Walk back through earlier element
    boundaries (after a `}`, `]` or `,`) until a prefix repairs into a dict
    with the expected keys — keeping every file that finished before the cut."""
    text = text.rstrip()
    cuts = [m.end() for m in re.finditer(r"[}\],]", text)]
    for cut in reversed(cuts[-600:]):
        prefix = text[:cut].rstrip().rstrip(",")
        try:
            parsed = json.loads(repair_truncated_json(prefix))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and ("reply" in parsed or "files" in parsed):
            return parsed
    return None


def extract_json_objects(text):
    """Find every syntactically-complete top-level JSON object in text, by
    scanning from each '{' and depth-matching braces (respecting string
    literals/escapes so a brace inside quoted text can't miscount) — far
    more reliable than naively slicing from the first '{' to the last '}' in
    the whole text, which breaks the moment any stray brace shows up in
    prose the model wrote before or after the actual JSON (a preamble
    explaining its plan, a sign-off line, etc.)."""
    found = []
    i, n = 0, len(text)
    while i < n:
        if text[i] == "{":
            depth, in_string, escape, j = 0, False, False, i
            while j < n:
                ch = text[j]
                if in_string:
                    if escape: escape = False
                    elif ch == "\\": escape = True
                    elif ch == '"': in_string = False
                else:
                    if ch == '"': in_string = True
                    elif ch == "{": depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            found.append((i, text[i:j + 1]))
                            break
                j += 1
            else:
                # Ran off the end of the text without this brace ever closing
                # — almost always means generation got cut off mid-object.
                # Keep it as a candidate for repair_truncated_json downstream
                # rather than silently dropping the model's whole response.
                found.append((i, text[i:]))
            i = j + 1
        else:
            i += 1
    return found


def decode_model_result(content):
    """Accept strict JSON, fenced JSON, imperfect free-model output (prose
    wrapped around the JSON, even with stray braces in that prose), and JSON
    truncated mid-stream (repaired on a best-effort basis)."""
    text = str(content or "").strip()
    if not text:
        raise ValueError("The selected model returned an empty response. Try another free model or retry.")
    candidates = [text]
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced: candidates.append(fenced.group(1))
    objects = extract_json_objects(text)
    # Prefer the largest candidate object first — the real payload is almost
    # always the biggest brace-matched chunk; a short one is more likely to
    # be something incidental the model wrote (a stray example, a code
    # snippet fragment) rather than the actual response.
    for _, candidate in sorted(objects, key=lambda pair: -len(pair[1])):
        candidates.append(candidate)
        candidates.append(repair_truncated_json(candidate))  # in case this exact one got cut off mid-stream
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and ("reply" in parsed or "files" in parsed):
                return parsed
        except json.JSONDecodeError:
            continue
    # Truncated output that plain bracket-closing could not repair.
    for _, candidate in sorted(objects, key=lambda pair: -len(pair[1])):
        salvaged = salvage_truncated_json(candidate)
        if salvaged: return salvaged
    # Last resort: any dict at all, even without the expected keys beats nothing.
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict): return parsed
        except json.JSONDecodeError:
            continue
    # The model ignored the structured format. Keep its work: HTML becomes a
    # real file, anything else is shown as the answer itself (and can still be
    # turned into a requested DOCX/PDF/PPTX/XLSX from that text).
    if re.search(r"<!doctype html|<html[\s>]", text, re.IGNORECASE):
        return {"reply": "Here's the page the model wrote.", "files": [{"path": "index.html", "kind": "text", "content": text}], "unstructured": True}
    return {"reply": text, "files": [], "unstructured": True}


def prune_old_workspaces():
    """Ephemeral disk hygiene: delete workspace folders older than the cutoff
    so a long-running process never silently fills its disk with old ZIPs."""
    cutoff = time.time() - WORKSPACE_MAX_AGE_SECONDS
    try:
        for entry in WORKSPACES.iterdir():
            if entry.is_dir() and entry.stat().st_mtime < cutoff:
                shutil.rmtree(entry, ignore_errors=True)
    except OSError:
        pass  # best-effort cleanup; never let this break a request


def tavily_search(query):
    """Search the live web via Tavily and return a compact text block the
    model can read as extra context. Raises on failure — the caller decides
    whether that should abort the request or just proceed without results."""
    response = requests.post(
        TAVILY_SEARCH_URL,
        headers={"Authorization": f"Bearer {TAVILY_API_KEY}"},
        json={"query": query, "search_depth": "basic", "max_results": 6, "include_answer": True},
        timeout=25,
    )
    response.raise_for_status()
    body = response.json()
    lines = []
    if body.get("answer"): lines.append(f"Summary: {body['answer']}")
    for result in body.get("results", [])[:6]:
        title = str(result.get("title", "")).strip()
        url = str(result.get("url", "")).strip()
        snippet = str(result.get("content", "")).strip()[:500]
        lines.append(f"- {title} ({url}): {snippet}")
    if not lines:
        raise ValueError("Tavily returned no results")
    return "\n".join(lines)



def sanitize_history(raw):
    """Only plain user/assistant text turns from the browser are trusted as
    history; any other role (e.g. an injected "system" turn) is dropped."""
    clean = []
    if not isinstance(raw, list): return clean
    for turn in raw[-10:]:
        if isinstance(turn, dict) and turn.get("role") in ("user", "assistant") and isinstance(turn.get("content"), str):
            clean.append({"role": turn["role"], "content": turn["content"][:12000]})
    return clean


def open_upstream(payload, timeout):
    """POST to Ollama Cloud with one quick retry for transient failures, and
    one retry without `think` if the chosen model rejects that parameter.
    Returns (response, error_message)."""
    last_error, dropped_think = None, False
    for attempt in range(3):
        try:
            candidate = requests.post(OLLAMA_CHAT_URL, headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"},
                                      json=payload, timeout=timeout, stream=True)
        except requests.RequestException as error:
            last_error = error; time.sleep(0.6); continue
        if candidate.status_code in (502, 503, 504) and attempt < 2:
            candidate.close(); last_error = f"upstream returned {candidate.status_code}"; time.sleep(0.8); continue
        if candidate.status_code == 400 and not dropped_think and "think" in payload:
            body = candidate.text[:400].lower()
            if "think" in body:
                candidate.close(); payload = {k: v for k, v in payload.items() if k != "think"}; dropped_think = True; continue
        return candidate, None
    return None, last_error


@app.get("/")
def index(): return render_template("index.html")


@app.get("/api/models")
def models():
    return jsonify(get_models())


@app.get("/api/config")
def config():
    return jsonify(webSearchEnabled=bool(TAVILY_API_KEY), defaultModel=default_model_id())


@app.get("/healthz")
def healthz():
    return jsonify(ok=True, configured=bool(OLLAMA_API_KEY))


@app.post("/api/chat")
def chat():
    if not OLLAMA_API_KEY:
        return jsonify(error="Velaris isn't configured yet: set the OLLAMA_API_KEY environment variable on the server to an Ollama Cloud API key (ollama.com/settings/keys), then restart."), 500
    if rate_limited(client_ip()):
        return jsonify(error="You're sending requests very quickly. Wait a few seconds and try again."), 429
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Malformed request body."), 400
    prompt = str(data.get("prompt", "")).strip()
    if not prompt: return jsonify(error="Enter a request."), 400
    if len(prompt) > 20000: return jsonify(error="That request is too long (20,000 character limit)."), 400
    prune_old_workspaces()

    mode = str(data.get("mode", "assist")).lower()
    requested_kinds = art.requested_artifact_kinds(prompt)
    mode_instruction = (
        "The user is in Velaris mode. Prioritize complete deliverables, real files, multi-file projects, validation, and practical structure. "
        "When a file is requested, create the actual requested format rather than explaining how to create it."
        if mode == "velaris" else
        "The user is in Assist mode. Prefer a concise, useful conversational answer. Only create files when the user explicitly asks for one."
    )
    if requested_kinds:
        mode_instruction += (" The user explicitly asked for a file: you MUST include a real " + " and a real ".join(k.upper() for k in requested_kinds) +
                             " file in \"files\" with the matching kind and a descriptive filename. Do not answer with only text.")
    messages = [{"role": "system", "content": SYSTEM}, {"role": "system", "content": mode_instruction}] + sanitize_history(data.get("history"))
    if data.get("web_search"):
        if not TAVILY_API_KEY:
            return jsonify(error="Web search isn't configured yet: set the TAVILY_API_KEY environment variable on the server (get a free key at app.tavily.com), then restart."), 500
        try:
            search_context = tavily_search(prompt)
            messages.append({"role": "system", "content": f"Live web search results for the user's request — use them to inform your answer, and mention where information came from where it's helpful, but don't fabricate beyond what's here:\n{search_context}"})
        except (requests.RequestException, ValueError, KeyError) as error:
            return jsonify(error=f"Web search failed: {error}"), 502
    messages.append({"role": "user", "content": prompt})

    allowed = {m["id"] for m in get_models()}
    model_id = data.get("model") if data.get("model") in allowed else default_model_id()
    power = str(data.get("power", DEFAULT_POWER)).lower()
    if power not in POWER_LEVELS: power = DEFAULT_POWER
    auto_upgraded_for_3d = looks_like_3d_request(prompt)
    if auto_upgraded_for_3d:
        model_id, power = best_model_id(), "max"
    power_config = POWER_LEVELS[power]

    payload = {"model": model_id, "messages": messages, "stream": True,
               "think": think_value(model_id, power_config),
               "options": {"temperature": 0.3, "num_predict": power_config["num_predict"]}}

    upstream, last_error = open_upstream(payload, UPSTREAM_TIMEOUT[power])
    if upstream is None:
        return jsonify(error=f"Ollama Cloud is temporarily unavailable ({last_error}). Please retry."), 502
    if upstream.status_code == 401:
        upstream.close(); return jsonify(error="Ollama Cloud rejected the API key. Check OLLAMA_API_KEY on the server."), 502
    if upstream.status_code == 404:
        upstream.close(); get_models(force=True)
        return jsonify(error=f"{model_id} isn't available on Ollama Cloud right now (it may have been retired). Pick another model from the menu."), 502
    if upstream.status_code == 429:
        upstream.close(); return jsonify(error=f"{model_id} is rate-limited on Ollama Cloud right now. Wait a bit or switch models."), 502
    try:
        upstream.raise_for_status()
    except requests.HTTPError:
        detail = upstream.text[:500]; status = upstream.status_code; upstream.close()
        return jsonify(error=f"Ollama Cloud rejected this request ({status}). {detail}"), 502

    def generate():
        extractor = ReplyStreamExtractor()
        raw_parts, done_reason = [], None
        try:
            if auto_upgraded_for_3d:
                yield json.dumps({"type": "info", "text": f"3D model request detected — auto-using {model_id} at Max power for best build quality."}) + "\n"
            try:
                for line in upstream.iter_lines(decode_unicode=True):
                    if not line: continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if chunk.get("error"):
                        yield json.dumps({"type": "error", "error": f"Ollama Cloud: {chunk['error']}"}) + "\n"
                        return
                    message = chunk.get("message") or {}
                    thinking = message.get("thinking", "")
                    if thinking:
                        yield json.dumps({"type": "thinking", "text": thinking}) + "\n"
                    piece = message.get("content", "")
                    if piece:
                        raw_parts.append(piece)
                        delta = extractor.feed(piece)
                        if delta: yield json.dumps({"type": "delta", "text": delta}) + "\n"
                    if chunk.get("done"):
                        done_reason = chunk.get("done_reason")
                        break
            except requests.RequestException as error:
                yield json.dumps({"type": "error", "error": f"Connection to Ollama Cloud dropped mid-response: {error}"}) + "\n"
                return
            finally:
                upstream.close()

            truncated = done_reason == "length"
            try:
                result = decode_model_result("".join(raw_parts))
            except ValueError:
                if extractor.emitted.strip():
                    result = {"reply": extractor.emitted, "files": []}
                elif truncated:
                    yield json.dumps({"type": "error", "error": "The model ran out of room before producing anything usable. Try a shorter request, break it into steps, switch models, or raise the Power level for more room."}) + "\n"
                    return
                else:
                    yield json.dumps({"type": "error", "error": "The model returned an empty or unusable response. Please try again."}) + "\n"
                    return
            reply = str(result.get("reply") or "").strip() or "Done."
            if truncated:
                reply += "\n\n⚠️ This response was cut short (ran out of room) — some content or files may be missing or incomplete. Try a shorter request, break it into steps, or raise the Power level for more room."

            raw_files = result.get("files", [])
            if not isinstance(raw_files, list): raw_files = []
            workspace_id = uuid.uuid4().hex; root = WORKSPACES / workspace_id; root.mkdir()
            notes, created = [], []
            for raw_item in raw_files[:50]:
                try:
                    made = art.produce_artifact(root, raw_item, prompt)
                    created.append(made); notes += made["warnings"]
                except Exception as error:
                    name = raw_item.get("path", "?") if isinstance(raw_item, dict) else "?"
                    notes.append(f"⚠️ Couldn't create '{name}': {error}")

            # Explicitly requested formats must materialise. If the model's own
            # file for a format failed or was missing, rebuild it from the reply.
            for kind in requested_kinds:
                if art.kind_satisfied(kind, created): continue
                item = art.fallback_item_from_reply(kind, result.get("reply"), prompt)
                if item:
                    try:
                        made = art.produce_artifact(root, item, prompt)
                        created.append(made); notes += made["warnings"]
                        notes.append(f"ℹ️ Built the {kind.upper()} from the written answer because the model's own file wasn't usable.")
                        continue
                    except Exception as error:
                        notes.append(f"⚠️ Fallback {kind.upper()} failed too: {error}")
                notes.append(f"❌ No {kind.upper()} file was created. Please press Regenerate; if it keeps failing, try Power: High or another model.")

            manifest = sorted(
                [{"path": p.relative_to(root).as_posix(), "bytes": p.stat().st_size,
                  "isImage": p.suffix.lower() in IMAGE_EXTENSIONS}
                 for p in root.rglob("*") if p.is_file()],
                key=lambda f: f["path"],
            )
            if not manifest:
                shutil.rmtree(root, ignore_errors=True)
            if notes: reply += "\n\n" + "\n".join(notes)
            yield json.dumps({"type": "done", "reply": reply, "workspace": workspace_id if manifest else None,
                              "files": manifest, "modelUsed": model_id, "powerUsed": power}) + "\n"
        except Exception as error:  # never let the stream just hang or die silently
            yield json.dumps({"type": "error", "error": f"Generation failed: {error}"}) + "\n"

    response = Response(stream_with_context(generate()), mimetype="application/x-ndjson")
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Accel-Buffering"] = "no"  # keep reverse proxies (Render/nginx) from buffering the stream
    return response


def _valid_workspace(workspace_id):
    if not re.fullmatch(r"[a-f0-9]{32}", workspace_id): abort(404)
    root = WORKSPACES / workspace_id
    if not root.is_dir(): abort(404)
    return root


@app.get("/api/download/<workspace_id>")
def download(workspace_id):
    root = _valid_workspace(workspace_id)
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(root.rglob("*")):
            if file.is_file(): archive.write(file, file.relative_to(root).as_posix())
    payload.seek(0)
    return send_file(payload, as_attachment=True, download_name=f"velaris-{workspace_id[:8]}.zip", mimetype="application/zip")


def resolve_workspace_file(workspace_id, filename):
    root = _valid_workspace(workspace_id)
    try:
        target = (root / safe_path(filename)).resolve()
    except ValueError:
        abort(404)
    if root.resolve() not in target.parents or not target.is_file(): abort(404)
    return target


@app.get("/api/download/<workspace_id>/<path:filename>")
def download_single(workspace_id, filename):
    target = resolve_workspace_file(workspace_id, filename)
    guessed = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return send_file(target, as_attachment=True, download_name=target.name, mimetype=guessed)


@app.get("/api/preview/<workspace_id>/<path:filename>")
def preview_single(workspace_id, filename):
    # Inline preview is limited to images. SVG is additionally sandboxed so it
    # can never run script in the app's origin; HTML/other types are refused.
    target = resolve_workspace_file(workspace_id, filename)
    if target.suffix.lower() not in IMAGE_EXTENSIONS: abort(404)
    mimetype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    response = send_file(target, as_attachment=False, mimetype=mimetype)
    response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "").strip().lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=debug_mode)
