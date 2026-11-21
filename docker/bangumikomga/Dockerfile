FROM python:3.13-slim
ARG BANGUMIKOMGA_REV=3ce5304707e4b8860b48d701b03f89bf421bac7e
WORKDIR /app
ADD https://codeload.github.com/chu-shen/BangumiKomga/tar.gz/${BANGUMIKOMGA_REV} /tmp/bangumikomga.tar.gz
RUN tar -xzf /tmp/bangumikomga.tar.gz --strip-components=1 -C /app \
    && rm /tmp/bangumikomga.tar.gz \
    && pip install --no-cache-dir -r install/requirements.txt \
    && mkdir -p logs && chown 65534:65534 logs
COPY config.py config/config.py
COPY studio.py .
ENV PYTHONDONTWRITEBYTECODE=1
USER 65534:65534
CMD ["python", "studio.py"]
