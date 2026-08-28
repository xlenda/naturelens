# Perch 2.0 inference server for NatureLens sound identification.
#
# WHY A SEPARATE HOST
# The Perch ONNX weights are 390 MB. Vercel caps a serverless bundle at 250 MB,
# and downloading 390 MB to a phone is out of the question. So the model lives
# here and api/_lib/perch.js talks to it over HTTP - the same shape as every
# other vendor in the app.
#
# LICENCE (the reason Perch and not BirdNET)
# Perch 2.0 is Apache 2.0 - commercial use permitted, no permission needed.
# BirdNET's weights are CC BY-NC-SA (non-commercial, and ShareAlike so even a
# fine-tune inherits it), which rules it out for a paid app.
#
# WHAT IT EXPECTS
# POST / with JSON: { audio: <base64 float32 PCM>, sample_rate: 32000, top_k: 3 }
# The CLIENT decodes and resamples the recording, because a browser has an
# AudioContext and this server would otherwise need ffmpeg/libsndfile - the
# dependency that makes a container hard to deploy anywhere.
#
# WHAT IT RETURNS
# { predictions: [ { label, common_name, scientific_name, code, group, score } ] }
#
# DEPLOY (any of these - all handle 390 MB fine)
#   * Hugging Face Space, Docker SDK          - see Dockerfile next to this file
#   * Fly.io / Render / Railway               - same Dockerfile
#   * A VPS with >= 2 GB free RAM             - uvicorn app:app --port 8000
# Set PERCH_ENDPOINT in Vercel to the resulting HTTPS URL, and
# PERCH_AUTH_TOKEN to the same 32+-character AUTH_TOKEN here. The host refuses
# to start without that boundary.

import base64
import os
import csv
import io
import hashlib
import hmac
import threading

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from huggingface_hub import hf_hub_download
from starlette.responses import JSONResponse

MODEL_REPO = "justinchuby/Perch-onnx"
# The _no_dft variant replaces the DFT node with a MatMul, which the author
# reports as faster. Same weights, same outputs.
MODEL_FILE = "perch_v2_no_dft.onnx"
MODEL_REVISION = "da88bf8c37c0b3068fc706fe509f633b9fbd28c1"
MODEL_SHA256 = "4dcf71c18a147198545944bb5149697e89e3ad2e16637fa8f0edf6d13035a017"

# The ONNX repo ships weights ONLY - no label list, so a raw model answers with
# a class index like "4821". The labels live with the original saved_model
# mirror, as two parallel CSVs of 14,795 rows each (one header + one row per
# class, in class-index order):
#
#   assets/labels.csv               -> scientific name  ("Falco peregrinus")
#   assets/perch_v2_ebird_classes.csv -> eBird code      ("perfal") or
#                                        "no_ebird_code"
#
# Verified against the model's own output width before trusting the alignment
# (see _load_labels) - a silent off-by-one here would rename every species on
# earth to its alphabetical neighbour, which is the kind of bug nobody notices.
LABEL_REPO = "cgeorgiaw/Perch"
LABEL_FILE = "assets/labels.csv"
EBIRD_FILE = "assets/perch_v2_ebird_classes.csv"
LABEL_REVISION = "c3c3c816976a6c1bb75140b8fbaef7397a6f708f"
LABEL_SHA256 = "e4d5c0397d8fb08bf90c6b13a34810af53504faad927e472fcc567793c9de057"
EBIRD_SHA256 = "861aef71b679d8dcf07c0c71375188c46b680bd808c61a539f254dc21319bcc9"

# Perch's class list is not purely taxonomic. 9,706 classes carry an eBird code
# (eBird covers birds and nothing else, so that code IS the bird test), 4,891
# more are iNaturalist species - mostly frogs, crickets, katydids, cicadas and
# bats - and the remaining 198 come from FSD50K, a general sound-event dataset:
# "Car", "Applause", "Accordion", "Speech".
#
# Those 198 matter. Recording traffic and being told you found a species called
# "Car" is worse than being told nothing, so they are flagged as noise and the
# app refuses them instead of dressing them up as wildlife. They are identifiable
# by shape: every FSD50K label is a single word or uses underscores, while every
# binomial is exactly two space-separated words.
NOISE_GROUP = "noise"

# Perch's input contract, from the model card: mono, 32 kHz, 5-second window,
# which is exactly 160,000 float32 samples.
SAMPLE_RATE = 32000
WINDOW = 5 * SAMPLE_RATE

# Ceiling on how much of a recording is analysed, aligned with the Vercel hop.
# The app records 10 seconds; 12 seconds leaves device-timing headroom without
# letting a direct caller multiply inference work behind Vercel's stricter gate.
MAX_AUDIO_SECONDS = 12
MAX_WINDOWS = 3
MAX_AUDIO_BYTES = MAX_AUDIO_SECONDS * SAMPLE_RATE * 4
MAX_AUDIO_BASE64_CHARS = ((MAX_AUDIO_BYTES + 2) // 3) * 4
# JSON field names, sample rate and top_k need only a few dozen bytes. Keep a
# small explicit envelope while rejecting oversized bodies before Pydantic
# allocates the full base64 string.
MAX_REQUEST_BYTES = MAX_AUDIO_BASE64_CHARS + 4096

# The classifier head. Perch also returns `embedding` (1536), `spatial_embedding`
# and `spectrogram`; selecting by NAME matters because an earlier version picked
# the first 2-D output wider than 1000 columns and silently got `embedding`,
# producing a flat 0.1% across 1,536 meaningless classes. Verified against the
# live model: outputs are embedding (1,1536), spatial_embedding (1,16,4,1536),
# spectrogram (1,500,128), label (1,14795).
LOGITS_OUTPUT = "label"

# Display calibration, measured on this exact checkpoint - not guessed.
#
# Perch's head is multi-label, so its raw logits are large and a plain sigmoid
# saturates: every one of the top five species came back as "100.0%", which tells
# a person nothing and is a lie about four of them.
#
# Measured baselines (docs/perch-host/bench.py, real Commons recordings):
#   pure silence  -> top logit  4.5
#   white noise   -> top logit  7.5   <- anything below this is not a detection
#   Cicada orni   -> top logit  9.1   (WRONG answer; true species ranked 3rd)
#   Hyla arborea  -> top logit 12.2   (correct - a frog, so not birds-only)
#   T. rufiventris-> top logit 12.6   (correct)
#   Cuculus canorus->top logit 13.5   (correct)
#   Strix aluco   -> top logit 14.0   (correct)
#   L. megarhynchos->top logit 14.7   (correct)
#
# Every correct answer sat at 12.2+ and the only wrong one at 9.1, so the floor
# goes just above the noise level and the ceiling just above the strongest real
# detection. The cicada then reads as 15% instead of 100% - still shown, but
# visibly a guess.
NOISE_FLOOR = 8.0
CONFIDENT_AT = 15.0

# Below this, the answer is statistically indistinguishable from white noise, so
# the app reports "nothing recognisable" rather than naming a species. Recording
# traffic and being told it is a quail is the failure this prevents - white noise
# alone scored 7.5 for Coturnix coturnix.
MIN_ACCEPT_LOGIT = 8.5


def _calibrate(logit: float) -> float:
    """Raw logit -> 0..1 confidence a person can read. See the constants above."""
    span = CONFIDENT_AT - NOISE_FLOOR
    return float(min(1.0, max(0.0, (logit - NOISE_FLOOR) / span)))

AUTH_TOKEN = os.getenv("AUTH_TOKEN", "").strip()
if len(AUTH_TOKEN) < 32:
    raise RuntimeError("AUTH_TOKEN must contain at least 32 characters")

app = FastAPI()


class SecurityBoundaryMiddleware:
    """Authenticate and cap the POST body before FastAPI/Pydantic reads it."""

    def __init__(self, app):
        self.inner = app

    async def __call__(self, scope, receive, send):
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/"
        ):
            await self.inner(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        supplied = headers.get(b"authorization", b"").decode("utf-8", "ignore")
        if not hmac.compare_digest(supplied, f"Bearer {AUTH_TOKEN}"):
            await JSONResponse({"detail": "unauthorized"}, status_code=401)(scope, receive, send)
            return

        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > MAX_REQUEST_BYTES:
                    await JSONResponse({"detail": "request too large"}, status_code=413)(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse({"detail": "invalid content length"}, status_code=400)(scope, receive, send)
                return

        # Read at most the accepted envelope before handing control to FastAPI.
        # Raising from a wrapped receive() is not reliable here: Starlette's
        # body parser translates that exception into its generic HTTP 400, so
        # the middleware never gets a chance to send the intended 413. A body
        # of this size is small enough to buffer once, and Pydantic still never
        # sees (or allocates a string for) an oversized base64 payload.
        chunks = []
        received = 0
        while True:
            message = await receive()
            if message.get("type") == "http.disconnect":
                return
            if message.get("type") != "http.request":
                continue
            chunk = message.get("body", b"")
            received += len(chunk)
            if received > MAX_REQUEST_BYTES:
                await JSONResponse({"detail": "request too large"}, status_code=413)(scope, receive, send)
                return
            if chunk:
                chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        await self.inner(scope, replay_receive, send)


app.add_middleware(SecurityBoundaryMiddleware)

# Loaded lazily on the first request, not at import: a platform that health-checks
# the port before the 390 MB model finishes loading would otherwise mark the
# container unhealthy and restart it in a loop.
_session = None
_labels = None
_labels_failed = False
_lock = threading.Lock()

# Caps how many ONNX inferences run at once.
#
# FastAPI runs a `def` (non-async) endpoint in Starlette's threadpool, which has
# 40 slots. Nothing stopped 40 simultaneous inferences on a 2-core box that also
# runs the owner's production dashboard, Express API and Instagram bot - the
# cores would be pinned and the cgroup pushed towards its MemoryMax kill, taking
# those co-tenants down as collateral.
#
# One at a time is the honest number here: with intra_op_num_threads=2 a single
# inference already uses both cores, so any parallelism is pure contention.
# Queued requests wait ~0.7s each, which is why the wait has a timeout rather
# than being unbounded - see identify().
_inference_slot = threading.BoundedSemaphore(1)
INFERENCE_WAIT_SECONDS = 30


def _is_species(label: str) -> bool:
    """A binomial is exactly two space-separated words with no underscore.

    Everything the FSD50K portion of the class list contributes fails this -
    "Car", "Bicycle_bell", "Boat_and_Water_vehicle" - and no scientific name
    passes it by accident.
    """
    return "_" not in label and len(label.split(" ")) == 2


def _verify_sha256(path: str, expected: str) -> None:
    digest = hashlib.sha256()
    with open(path, "rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if not hmac.compare_digest(actual, expected):
        raise RuntimeError(
            f"artifact integrity check failed for {os.path.basename(path)}"
        )


def _load_labels():
    """Class index -> {scientific, code, group}, or None if unavailable.

    None makes the endpoint fail closed with 503. A numeric class index is not
    an identity and must never become a species card while taxonomy is missing.
    """
    try:
        label_path = hf_hub_download(
            repo_id=LABEL_REPO,
            filename=LABEL_FILE,
            revision=LABEL_REVISION,
        )
        ebird_path = hf_hub_download(
            repo_id=LABEL_REPO,
            filename=EBIRD_FILE,
            revision=LABEL_REVISION,
        )
        _verify_sha256(label_path, LABEL_SHA256)
        _verify_sha256(ebird_path, EBIRD_SHA256)

        def read(path):
            with open(path, newline="", encoding="utf-8") as f:
                # Skip the header row; the remaining rows are in class order.
                return [r[0].strip() for r in csv.reader(f) if r][1:]

        names = read(label_path)
        codes = read(ebird_path)

        # The two files must describe the same classes in the same order. If they
        # ever diverge, pairing them would mislabel species instead of failing.
        if len(names) != len(codes):
            return None

        out = []
        for name, code in zip(names, codes):
            has_code = bool(code) and code != "no_ebird_code"
            if not _is_species(name):
                group = NOISE_GROUP
            elif has_code:
                # eBird is a bird database. A code present means this class is a
                # bird - a cheap, exact group signal with no taxonomy lookup.
                group = "bird"
            else:
                # Frog, cricket, cicada, bat... The binomial alone does not say
                # which, and guessing would put "Bird" under a frog's name. The
                # client shows a neutral "Sound" label for None and looks the
                # species up on Wikipedia, which does know.
                group = None
            out.append(
                {
                    "scientific": name if _is_species(name) else None,
                    # FSD50K labels read better without their underscores.
                    "raw": name.replace("_", " "),
                    "code": code if has_code else None,
                    "group": group,
                }
            )
        return out
    except Exception as error:
        print(f"perch: label load failed ({type(error).__name__})", flush=True)
        return None


def _get_session():
    """Loads the model and labels on first use, ready-to-serve or not at all.

    TWO BUGS THIS SHAPE EXISTS TO PREVENT (both found in adversarial review):

    1. PUBLISHING _session BEFORE _labels.
       The fast path below reads _session outside the lock. The previous version
       assigned _session and only THEN spent 0.4-0.5s inside _load_labels(), so a
       second request arriving in that window took the fast path, ran inference,
       and read a still-None _labels - answering with the raw class index, e.g.
       a species card titled "4821" which the app then looked up on Wikipedia.
       Cold start is exactly when a retry arrives (Vercel gives up at 45s while
       the 390 MB load takes 20-40s), so that second request was the normal case,
       not a rare interleaving. Everything is therefore assembled into locals and
       published in one step, labels first.

    2. A FAILED LABEL LOAD LATCHING FOREVER.
       If _load_labels() returned None (Hub 429, DNS blip on first boot) the old
       fast path short-circuited on _session forever after, so every later
       response named species by index until someone restarted the unit - with
       nothing logged and /health still cheerfully reporting ok. Labels now have
       their own retry flag, so a later request tries again.
    """
    global _session, _labels, _labels_failed
    # Ready means both loaded. A transient Hub/DNS failure must not latch an
    # index-only mode forever; the next request retries the pinned labels.
    if _session is not None and _labels is not None:
        return _session

    with _lock:
        # Re-check inside the lock: another thread may have finished while this
        # one waited.
        if _session is not None and _labels is not None:
            return _session

        session = _session
        if session is None:
            model_path = hf_hub_download(
                repo_id=MODEL_REPO,
                filename=MODEL_FILE,
                revision=MODEL_REVISION,
            )
            _verify_sha256(model_path, MODEL_SHA256)
            opts = ort.SessionOptions()
            # One thread per core is the default and it thrashes on small shared
            # hosts; 2 is enough for a single 5-second window.
            opts.intra_op_num_threads = 2
            session = ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])

        labels = _labels
        if labels is None:
            labels = _load_labels()
            if labels is None:
                # Record the failure so the next request retries instead of
                # inheriting it silently.
                _labels_failed = True
                print("perch: label load FAILED - taxonomy unavailable; retrying "
                      "on a later request", flush=True)
            else:
                _labels_failed = False

        # Single publish point, labels before session, so no reader can ever see
        # a session without its labels.
        _labels = labels
        _session = session

    return _session


class Request(BaseModel):
    audio: str          # base64 of float32 little-endian PCM, mono
    sample_rate: int = SAMPLE_RATE
    top_k: int = 3


def _windows(samples: np.ndarray) -> np.ndarray:
    """Cuts a recording into consecutive 5-second windows -> (n, 160000).

    Perch takes exactly 160,000 samples, so a 10-second recording has to be
    split. Centre-cropping to one window was the first version and it was wrong:
    a bird that calls in the last three seconds got thrown away, and a person
    fumbling for the stop button is exactly when that happens.

    Windows are scored independently and the best score per class wins (see
    identify), which is what BirdNET and Perch's own tooling do - a call present
    in one window should not be diluted by the silence in another.
    """
    if samples.size <= WINDOW:
        out = np.zeros((1, WINDOW), dtype=np.float32)
        out[0, : samples.size] = samples
        return out

    count = min(MAX_WINDOWS, -(-samples.size // WINDOW))  # ceil
    out = np.zeros((count, WINDOW), dtype=np.float32)
    for i in range(count):
        chunk = samples[i * WINDOW : (i + 1) * WINDOW]
        out[i, : chunk.size] = chunk
    return out


def _describe(index: int, logit: float):
    score = _calibrate(logit)
    if not _labels or index >= len(_labels):
        # No label list loaded: say so plainly instead of passing an index off as
        # a name.
        return {
            "label": str(index),
            "common_name": None,
            "scientific_name": None,
            "code": None,
            "group": None,
            "score": score,
            "logit": float(logit),
        }

    row = _labels[index]
    return {
        # `label` is what the app falls back to when it has nothing better. For a
        # species that is the binomial; the client then resolves the common name
        # in the user's own language from Wikipedia, which is why no common-name
        # column is needed here (and none exists in the CSVs).
        "label": row["raw"],
        "common_name": None,
        "scientific_name": row["scientific"],
        "code": row["code"],
        "group": row["group"],
        "score": score,
        # Raw logit alongside the calibrated score, so the thresholds above can be
        # re-tuned from real traffic later without redeploying to collect data.
        "logit": float(logit),
    }


@app.get("/health")
def health():
    # Deliberately does NOT touch the model: a health check that loads 390 MB
    # would time out on every cold start.
    return {"ok": True, "model_loaded": _session is not None}


@app.post("/")
def identify(req: Request, authorization: str = Header(default="")):
    global _labels, _labels_failed
    # Middleware performs this check before body parsing; keep it here as a
    # defence-in-depth invariant if the route is mounted differently in tests.
    if not hmac.compare_digest(authorization, f"Bearer {AUTH_TOKEN}"):
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        raw = base64.b64decode(req.audio, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="audio is not valid base64")

    if len(raw) % 4 != 0:
        raise HTTPException(status_code=400, detail="audio is not float32 PCM")

    # Refuse an oversized clip BEFORE allocating a float32 copy of it.
    #
    # The app records at most 10 seconds, and the request body limit upstream is
    # 4.5 MB - which is about 34 seconds of audio, six windows, six inferences
    # for one request. Someone hand-crafting the payload could therefore multiply
    # the per-request cost sixfold against a 2-core box that also serves the
    # owner's production dashboard. Checking the byte length is exact and free:
    # 4 bytes per sample, so the ceiling is arithmetic, not a guess.
    max_samples = MAX_AUDIO_SECONDS * SAMPLE_RATE
    if len(raw) // 4 > max_samples:
        raise HTTPException(
            status_code=413,
            detail=(
                f"audio is longer than {MAX_AUDIO_SECONDS}s "
                f"({len(raw) // 4} samples, limit {max_samples})"
            ),
        )

    samples = np.frombuffer(raw, dtype="<f4").astype(np.float32)
    if samples.size == 0:
        raise HTTPException(status_code=400, detail="audio is empty")

    # A clip of pure NaN or inf would sail through the model and come out as
    # garbage logits that _calibrate() turns into a confident-looking score.
    if not np.all(np.isfinite(samples)):
        raise HTTPException(status_code=400, detail="audio contains non-finite samples")

    if req.sample_rate != SAMPLE_RATE:
        # The client is supposed to resample. Refuse rather than guess: feeding
        # 44.1 kHz audio to a 32 kHz model shifts every frequency and produces
        # confident nonsense, which is worse than an error.
        raise HTTPException(
            status_code=400,
            detail=f"sample_rate must be {SAMPLE_RATE}, got {req.sample_rate}",
        )

    batch = _windows(samples)

    session = _get_session()
    if _labels is None:
        raise HTTPException(status_code=503, detail="taxonomy unavailable, try again")
    input_name = session.get_inputs()[0].name
    names = [o.name for o in session.get_outputs()]
    if LOGITS_OUTPUT not in names:
        raise HTTPException(status_code=500, detail="model has no classifier head")

    # Serialise the actual inference. See _inference_slot for why one at a time is
    # the right number on this box. The timeout matters: without it, a burst would
    # leave dozens of threadpool slots blocked and the whole service unresponsive,
    # including /health.
    if not _inference_slot.acquire(timeout=INFERENCE_WAIT_SECONDS):
        raise HTTPException(status_code=503, detail="busy, try again")
    try:
        # Ask for only the classifier head. The embeddings and the spectrogram are
        # several megabytes of tensor this endpoint never looks at.
        logits = np.asarray(session.run([LOGITS_OUTPUT], {input_name: batch})[0])
    finally:
        _inference_slot.release()

    # The label CSVs come from a different repo than the weights, so nothing
    # guarantees they describe this exact checkpoint. Comparing widths is the one
    # check that catches a mismatch; without it a shifted or resized class list
    # would rename every species to a neighbour and still look plausible.
    #
    # A mismatch fails closed. The next request reloads the pinned taxonomy;
    # serving raw numeric class IDs would be useless and risks mislabelling.
    if _labels is not None and len(_labels) != logits.shape[-1]:
        print(
            f"perch: label/model width mismatch ({len(_labels)} labels vs "
            f"{logits.shape[-1]} classes) - discarding labels",
            flush=True,
        )
        _labels = None
        _labels_failed = True
        raise HTTPException(status_code=503, detail="taxonomy/model mismatch")

    # Best window per class, on the raw logits. A call heard clearly once should
    # not be averaged down by the seconds of silence around it.
    scores = logits.max(axis=0)

    k = max(1, min(int(req.top_k), 10))
    top = np.argsort(scores)[::-1][:k]
    best = float(scores[top[0]])

    return {
        "windows": int(batch.shape[0]),
        # Lets the caller reject the whole result without re-deriving the
        # threshold. Below MIN_ACCEPT_LOGIT the top answer is no better than what
        # white noise produces, so naming a species would be inventing one.
        "confident": best >= MIN_ACCEPT_LOGIT,
        "predictions": [_describe(int(i), scores[i]) for i in top],
    }
