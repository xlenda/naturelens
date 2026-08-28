# Perch 2.0 inference host for NatureLens.
#
# onnxruntime instead of tensorflow on purpose: the official Perch example asks
# for TensorFlow 2.20 and a GPU, which would make this image several GB and need
# hardware nobody wants to pay for. The community ONNX conversion runs the same
# weights on plain CPU in a fraction of the space.
FROM python:3.11-slim

# No system audio libraries needed at all - the client sends decoded float32 PCM,
# so there is no ffmpeg/libsndfile to install. That is what keeps this image
# small and deployable on any platform.
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# The inference service does not need root. Its only writable state is the
# reviewed Hugging Face cache under /tmp.
RUN useradd --create-home --uid 10001 naturelens
USER naturelens

# The 390 MB model is downloaded on first request, not baked into the image:
# a 390 MB layer makes every deploy slow, and platforms cache the HF download
# between restarts anyway. HF_HOME points at a writable path - Hugging Face
# Spaces runs as a non-root user whose home is not writable.
ENV HF_HOME=/tmp/hf
ENV PORT=7860

EXPOSE 7860

# Single worker: two workers would load 390 MB twice and OOM a 16 GB box faster
# than you would expect once ONNX arenas are counted.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT} --workers 1"]
