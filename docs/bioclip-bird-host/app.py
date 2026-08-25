"""Host privado do classificador mundial de aves usado pelo NatureLens.

Fotos existem somente em memoria durante a requisicao. O processo nao grava,
nao registra e nao devolve a imagem recebida.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
import threading
from contextlib import asynccontextmanager, nullcontext
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import httpx
import numpy as np
import open_clip
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field
from huggingface_hub import snapshot_download


CONTRACT_VERSION = 1
MODEL_ID = "imageomics/bioclip-2"
DEFAULT_MODEL_REVISION = "2957b322090f9cb17ae72c71981c7218a28d81e0"
TAXONOMY_SOURCE = "birdnet-taxonomy/AviList"
TAXONOMY_API = "https://birdnet.cornell.edu/taxonomy/api/species"
DEFAULT_TAXONOMY_VERSION = "v0.3-Jul2026"
MAX_IMAGES = 3
MAX_DATA_URI_CHARS = 5_000_000
MAX_TOTAL_DATA_URI_CHARS = 12_000_000
MAX_DECODED_BYTES = 4_000_000
MAX_IMAGE_PIXELS = 25_000_000
MAX_TAXONOMY_PAGE_BYTES = 4 * 1024 * 1024
MIN_WORLD_BIRD_COUNT = 10_000
TEXT_BATCH_SIZE = 256
PROMPT_VERSION = "scientific-bird-v1"

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class IdentifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: int
    images: list[str] = Field(min_length=1, max_length=MAX_IMAGES)
    topK: int = Field(default=3, ge=2, le=5)


@dataclass(frozen=True)
class Settings:
    cache_dir: Path
    model_revision: str
    taxonomy_version: str
    auth_token: str | None
    allow_unauthenticated: bool
    device: str

    @classmethod
    def from_env(cls) -> "Settings":
        revision = os.getenv("BIOCLIP_MODEL_REVISION", DEFAULT_MODEL_REVISION).strip()
        if not revision or any(char not in "0123456789abcdefABCDEF" for char in revision):
            raise RuntimeError("BIOCLIP_MODEL_REVISION deve ser um commit SHA")
        taxonomy_version = os.getenv(
            "BIRDNET_TAXONOMY_VERSION", DEFAULT_TAXONOMY_VERSION
        ).strip()
        if not taxonomy_version:
            raise RuntimeError("BIRDNET_TAXONOMY_VERSION vazio")
        token = os.getenv("BIOCLIP_BIRD_AUTH_TOKEN", "").strip() or None
        allow_unauthenticated = (
            os.getenv("BIOCLIP_ALLOW_UNAUTHENTICATED", "").strip().lower() == "true"
        )
        if token and len(token) < 32:
            raise RuntimeError("BIOCLIP_BIRD_AUTH_TOKEN deve ter ao menos 32 caracteres")
        if not token and not allow_unauthenticated:
            raise RuntimeError(
                "defina BIOCLIP_BIRD_AUTH_TOKEN ou habilite "
                "BIOCLIP_ALLOW_UNAUTHENTICATED=true conscientemente"
            )
        requested_device = os.getenv("BIOCLIP_DEVICE", "auto").strip().lower()
        if requested_device not in {"auto", "cpu", "cuda"}:
            raise RuntimeError("BIOCLIP_DEVICE deve ser auto, cpu ou cuda")
        if requested_device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("BIOCLIP_DEVICE=cuda, mas CUDA nao esta disponivel")
        device = (
            "cuda"
            if requested_device == "cuda"
            or (requested_device == "auto" and torch.cuda.is_available())
            else "cpu"
        )
        return cls(
            cache_dir=Path(os.getenv("BIOCLIP_CACHE_DIR", "/data")).resolve(),
            model_revision=revision.lower(),
            taxonomy_version=taxonomy_version,
            auth_token=token,
            allow_unauthenticated=allow_unauthenticated,
            device=device,
        )


def _safe_json(response: httpx.Response, max_bytes: int) -> dict[str, Any]:
    if response.status_code != 200:
        raise RuntimeError(f"taxonomia respondeu HTTP {response.status_code}")
    if response.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise RuntimeError("taxonomia nao respondeu JSON")
    if len(response.content) > max_bytes:
        raise RuntimeError("pagina da taxonomia excedeu o limite")
    value = response.json()
    if not isinstance(value, dict):
        raise RuntimeError("pagina da taxonomia tem contrato invalido")
    return value


def _clean_species(row: Any) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    scientific = row.get("scientific_name")
    words = scientific.split() if isinstance(scientific, str) else []
    if (
        len(words) != 2
        or not words[0][:1].isupper()
        or not words[1][:1].islower()
        or row.get("taxon_group") != "Aves"
        or row.get("record_type") != "species"
    ):
        return None
    try:
        gbif_key = int(row.get("gbif_id"))
    except (TypeError, ValueError):
        return None
    if gbif_key <= 0:
        return None
    common = row.get("common_name")
    birdnet_id = row.get("birdnet_id")
    return {
        "scientificName": " ".join(words),
        "commonName": common.strip()[:160] if isinstance(common, str) and common.strip() else None,
        "birdnetId": birdnet_id.strip()[:80]
        if isinstance(birdnet_id, str) and birdnet_id.strip()
        else None,
        "gbifKey": gbif_key,
    }


def _download_taxonomy(settings: Settings) -> list[dict[str, Any]]:
    species: list[dict[str, Any]] = []
    page = 1
    total: int | None = None
    received = 0
    fields = (
        "scientific_name,common_name,birdnet_id,gbif_id,taxon_group,record_type"
    )
    timeout = httpx.Timeout(30.0, connect=10.0)
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        while total is None or received < total:
            response = client.get(
                TAXONOMY_API,
                params={
                    "group": "Aves",
                    "page": page,
                    "per_page": 500,
                    "fields": fields,
                },
                headers={"Accept": "application/json", "User-Agent": "NatureLens-BioCLIP/1"},
            )
            payload = _safe_json(response, MAX_TAXONOMY_PAGE_BYTES)
            if payload.get("taxonomy_version") != settings.taxonomy_version:
                raise RuntimeError(
                    "versao BirdNET mudou; revise a lista e atualize "
                    "BIRDNET_TAXONOMY_VERSION conscientemente"
                )
            page_total = payload.get("total")
            rows = payload.get("results")
            if not isinstance(page_total, int) or not isinstance(rows, list) or not rows:
                raise RuntimeError("paginacao BirdNET invalida")
            total = page_total
            received += len(rows)
            for row in rows:
                clean = _clean_species(row)
                if clean:
                    species.append(clean)
            page += 1
            if page > 100:
                raise RuntimeError("paginacao BirdNET excedeu o limite")

    by_name = {item["scientificName"]: item for item in species}
    if len(by_name) < MIN_WORLD_BIRD_COUNT:
        raise RuntimeError("lista Aves mundial ficou incompleta")
    return [by_name[name] for name in sorted(by_name)]


def _atomic_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(path)


def _load_taxonomy(settings: Settings) -> list[dict[str, Any]]:
    path = settings.cache_dir / f"birds-{settings.taxonomy_version}.json"
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            rows = payload.get("species") if isinstance(payload, dict) else None
            if (
                payload.get("source") == TAXONOMY_SOURCE
                and payload.get("version") == settings.taxonomy_version
                and isinstance(rows, list)
                and len(rows) >= MIN_WORLD_BIRD_COUNT
                and all(_clean_cached_species(row) for row in rows)
            ):
                return rows
        except (OSError, ValueError, TypeError):
            pass
    rows = _download_taxonomy(settings)
    _atomic_json(
        path,
        {"source": TAXONOMY_SOURCE, "version": settings.taxonomy_version, "species": rows},
    )
    return rows


def _clean_cached_species(row: Any) -> bool:
    return (
        isinstance(row, dict)
        and isinstance(row.get("scientificName"), str)
        and len(row["scientificName"].split()) == 2
        and isinstance(row.get("gbifKey"), int)
        and row["gbifKey"] > 0
    )


def _embedding_cache_key(settings: Settings, species: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    digest.update(settings.model_revision.encode())
    digest.update(settings.taxonomy_version.encode())
    digest.update(PROMPT_VERSION.encode())
    for row in species:
        digest.update(row["scientificName"].encode())
        digest.update(str(row["gbifKey"]).encode())
    return digest.hexdigest()[:24]


def _prompt(row: dict[str, Any]) -> str:
    # O nome cientifico vem primeiro porque e a classe do zero-shot; "Aves"
    # ancora o reino visual sem depender de um nome popular apenas em ingles.
    return f"{row['scientificName']}, a species of bird in class Aves"


class BirdClassifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.cache_dir.mkdir(parents=True, exist_ok=True)
        self.species = _load_taxonomy(settings)
        self.device = torch.device(settings.device)
        snapshot = snapshot_download(
            repo_id=MODEL_ID,
            revision=settings.model_revision,
            cache_dir=str(settings.cache_dir / "huggingface"),
            allow_patterns=[
                "open_clip_config.json",
                "open_clip_model.safetensors",
                "merges.txt",
                "special_tokens_map.json",
                "tokenizer.json",
                "tokenizer_config.json",
                "vocab.json",
            ],
        )
        model_ref = f"local-dir:{snapshot}"
        precision = "fp16" if self.device.type == "cuda" else "fp32"
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            model_ref,
            precision=precision,
            device=self.device,
        )
        self.tokenizer = open_clip.get_tokenizer(model_ref)
        self.model.eval()
        self.text_embeddings = self._load_or_build_embeddings()
        self.lock = threading.Lock()

    def _autocast(self):
        return torch.autocast(device_type="cuda", dtype=torch.float16) \
            if self.device.type == "cuda" else nullcontext()

    def _load_or_build_embeddings(self) -> torch.Tensor:
        key = _embedding_cache_key(self.settings, self.species)
        path = self.settings.cache_dir / f"bird-text-{key}.npy"
        expected_shape = (len(self.species),)
        if path.exists():
            array = np.load(path, allow_pickle=False)
            if array.ndim == 2 and array.shape[0] == expected_shape[0]:
                tensor = torch.from_numpy(np.asarray(array, dtype=np.float32))
                return torch.nn.functional.normalize(tensor, dim=-1).to(self.device)

        chunks: list[torch.Tensor] = []
        with torch.inference_mode():
            for offset in range(0, len(self.species), TEXT_BATCH_SIZE):
                prompts = [_prompt(row) for row in self.species[offset:offset + TEXT_BATCH_SIZE]]
                tokens = self.tokenizer(prompts).to(self.device)
                with self._autocast():
                    encoded = self.model.encode_text(tokens)
                chunks.append(torch.nn.functional.normalize(encoded.float(), dim=-1).cpu())
        tensor = torch.cat(chunks, dim=0)
        temporary = path.with_suffix(".tmp.npy")
        np.save(temporary, tensor.numpy().astype(np.float16), allow_pickle=False)
        temporary.replace(path)
        return tensor.to(self.device)

    def identify(self, images: list[Image.Image], top_k: int) -> dict[str, Any]:
        with self.lock, torch.inference_mode():
            batch = torch.stack([self.preprocess(image) for image in images]).to(self.device)
            with self._autocast():
                encoded = self.model.encode_image(batch)
            encoded = torch.nn.functional.normalize(encoded.float(), dim=-1)
            # As fotos representam o mesmo individuo; a media normalizada evita
            # tratar cada angulo como uma especie concorrente.
            subject = torch.nn.functional.normalize(encoded.mean(dim=0), dim=0)
            scores = self.text_embeddings @ subject
            values, indices = torch.topk(scores, k=top_k, largest=True, sorted=True)

        predictions = []
        for score, index in zip(values.cpu().tolist(), indices.cpu().tolist()):
            row = self.species[index]
            predictions.append(
                {
                    **row,
                    "rank": "species",
                    "taxonGroup": "Aves",
                    "score": float(score),
                }
            )
        return {
            "schemaVersion": CONTRACT_VERSION,
            "model": MODEL_ID,
            "modelRevision": self.settings.model_revision,
            "scoreType": "cosine_similarity",
            "taxonomy": {
                "source": TAXONOMY_SOURCE,
                "version": self.settings.taxonomy_version,
                "taxonGroup": "Aves",
                "count": len(self.species),
            },
            "topMargin": predictions[0]["score"] - predictions[1]["score"],
            "predictions": predictions,
        }


def _decode_image(data_uri: str) -> Image.Image:
    if not isinstance(data_uri, str) or len(data_uri) > MAX_DATA_URI_CHARS:
        raise HTTPException(status_code=413, detail="image_too_large")
    prefixes = (
        "data:image/jpeg;base64,",
        "data:image/png;base64,",
        "data:image/webp;base64,",
    )
    prefix = next((candidate for candidate in prefixes if data_uri.startswith(candidate)), None)
    if not prefix:
        raise HTTPException(status_code=422, detail="invalid_image_type")
    try:
        decoded = base64.b64decode(data_uri[len(prefix):], validate=True)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="invalid_base64") from None
    if not decoded or len(decoded) > MAX_DECODED_BYTES:
        raise HTTPException(status_code=413, detail="image_too_large")
    try:
        image = Image.open(io.BytesIO(decoded))
        image.verify()
        image = Image.open(io.BytesIO(decoded)).convert("RGB")
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise HTTPException(status_code=413, detail="too_many_pixels")
        return image
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=422, detail="invalid_image") from None


settings = Settings.from_env()
classifier: BirdClassifier | None = None
inference_slots = asyncio.Semaphore(2 if settings.device == "cuda" else 1)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global classifier
    classifier = await run_in_threadpool(BirdClassifier, settings)
    yield
    classifier = None


app = FastAPI(
    title="NatureLens BioCLIP Bird Host",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


def authorise(authorization: Annotated[str | None, Header()] = None) -> None:
    if not settings.auth_token:
        return
    expected = f"Bearer {settings.auth_token}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorised")


@app.get("/healthz")
def health() -> dict[str, Any]:
    return {"ready": classifier is not None, "contract": CONTRACT_VERSION}


@app.post("/v1/identify", dependencies=[Depends(authorise)])
async def identify(
    request: IdentifyRequest,
    contract: Annotated[str | None, Header(alias="X-NatureLens-Contract")] = None,
) -> dict[str, Any]:
    if request.schemaVersion != CONTRACT_VERSION or contract != str(CONTRACT_VERSION):
        raise HTTPException(status_code=409, detail="contract_mismatch")
    if sum(len(value) for value in request.images) > MAX_TOTAL_DATA_URI_CHARS:
        raise HTTPException(status_code=413, detail="images_too_large")
    current = classifier
    if current is None:
        raise HTTPException(status_code=503, detail="model_not_ready")
    images = [_decode_image(value) for value in request.images]
    async with inference_slots:
        return await run_in_threadpool(current.identify, images, request.topK)
