# dsh-plugin-lightnovel — Linux x86-64 image for 飞牛 NAS / any amd64 Docker host.
#
# Build for the NAS (from this directory):
#   docker build --platform linux/amd64 -t dsh-plugin-lightnovel:1.0.0 .
#
# The Dart stage compiles the *original* bili_novel_packer core into a single
# native executable (/opt/bnp/bnp_headless); DartBridge auto-detects that path.
# The runtime stage ships Node 24 + the real DSH CLI + the prebuilt plugin.

# ---------------------------------------------------------------------------
# Global build args: these MUST be declared before the first FROM so that every
# `FROM ${...}` can resolve them. An ARG declared inside a stage is stage-scoped
# and cannot be used by a later FROM.
# ---------------------------------------------------------------------------
ARG DEBIAN_BASE=debian:bookworm-slim
ARG NODE_BASE=node:24-bookworm-slim

# ---------------------------------------------------------------------------
# Stage 1: compile the vendored Dart headless core for linux/amd64
# ---------------------------------------------------------------------------
FROM --platform=linux/amd64 ${DEBIAN_BASE} AS dart-builder

ARG DART_VERSION=3.13.7
ARG PUB_HOSTED_URL=https://pub.flutter-io.cn
# Dual-stack hosts can have one IP family throttled to a crawl while the other
# is fine. Set DART_CURL_OPTS=-6 (or -4) as a build arg to force the fast route.
# Example: docker compose build --build-arg DART_CURL_OPTS=-6
ARG DART_CURL_OPTS=""

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Optional pre-seeded SDK: on hosts where a single build-container connection
# is throttled, download the archive on the host and drop it into build-assets/.
# The Dockerfile then copies it from the build context instead of using curl.
COPY build-assets /opt/build-assets

# Never inherit an HTTP proxy: on some NAS/router setups the proxy accepts the
# connection but never returns data, which hangs the build forever.
# The SDK is ~228 MB; --max-time must be generous enough for slow links.
RUN if [ -s /opt/build-assets/dartsdk-linux-x64-release.zip ]; then \
      echo "[dart-builder] using pre-seeded SDK archive" \
      && cp /opt/build-assets/dartsdk-linux-x64-release.zip /tmp/dart.zip; \
    else \
      curl --noproxy '*' ${DART_CURL_OPTS} -fsSL \
        --connect-timeout 15 --max-time 3600 --retry 3 --retry-delay 2 \
        -o /tmp/dart.zip \
        "https://storage.googleapis.com/dart-archive/channels/stable/release/${DART_VERSION}/sdk/dartsdk-linux-x64-release.zip"; \
    fi \
 && unzip -q /tmp/dart.zip -d /opt \
 && rm -rf /tmp/dart.zip /opt/build-assets \
 && /opt/dart-sdk/bin/dart --disable-analytics \
 && /opt/dart-sdk/bin/dart --version

ENV PATH="/opt/dart-sdk/bin:${PATH}" \
    PUB_CACHE=/opt/pub-cache \
    PUB_HOSTED_URL=${PUB_HOSTED_URL}

WORKDIR /build
COPY vendor/bili_novel_packer/pubspec.yaml ./pubspec.yaml
COPY vendor/bili_novel_packer/analysis_options.yaml ./analysis_options.yaml
RUN dart pub get

COPY vendor/bili_novel_packer/lib ./lib
COPY vendor/bili_novel_packer/bin ./bin
# Strict compile: never mask a failed build with `|| true`, otherwise the image
# would ship without the Dart core and every download would fail at runtime.
# `dart compile exe` does not create the parent directory of -o.
RUN mkdir -p /opt/bnp \
 && dart compile exe bin/headless.dart -o /opt/bnp/bnp_headless \
 && test -x /opt/bnp/bnp_headless

# ---------------------------------------------------------------------------
# Stage 2: Node 24 + DSH CLI + plugin bundle
# ---------------------------------------------------------------------------
FROM --platform=linux/amd64 ${NODE_BASE} AS runtime

LABEL org.opencontainers.image.title="dsh-plugin-lightnovel" \
      org.opencontainers.image.description="DeepSeek Harness native plugin for light-novel search and EPUB download" \
      org.opencontainers.image.version="1.0.0"

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/lightnovel

# Install all dependencies (including the DSH CLI used to boot the profile).
# `dist/` and `scripts/prepare.mjs` must exist BEFORE npm install: the prepare
# hook otherwise tries to run `tsc` with no src/ present and fails the build.
COPY package.json package-lock.json tsconfig.json ./
COPY dist ./dist
COPY scripts/prepare.mjs ./scripts/prepare.mjs
RUN npm ci --no-audit --no-fund && npm cache clean --force

# Ship the plugin, the vendored Dart core and the offline fixtures.
COPY cordis.patch.yml ./cordis.patch.yml
COPY vendor/bili_novel_packer ./vendor/bili_novel_packer
COPY test/fixtures ./test/fixtures
COPY scripts ./scripts
COPY docs ./docs
COPY docker/entrypoint.sh /usr/local/bin/ln-entrypoint.sh
COPY README.md LICENSE THIRD_PARTY_NOTICES.md ./

COPY --from=dart-builder /opt/bnp/bnp_headless /opt/bnp/bnp_headless
RUN chmod +x /opt/bnp/bnp_headless /usr/local/bin/ln-entrypoint.sh

# DSH profile + all mutable state live on the mounted NAS volume.
ENV DSH_HOME=/data/dsh-home \
    LN_DATA_DIR=/data \
    LN_LIBRARY_DIR=/data/library \
    LN_FIXTURES_DIR=/opt/lightnovel/test/fixtures \
    LN_DART_BINARY=/opt/bnp/bnp_headless \
    LN_DART_PROJECT_DIR=/opt/lightnovel/vendor/bili_novel_packer \
    LN_ENABLED_SOURCES=bilinovel,fixture \
    LN_OFFLINE_ONLY=false \
    LN_RESPECT_ROBOTS=true \
    LN_LOG_LEVEL=info \
    NODE_ENV=production

RUN mkdir -p /data/library /data/tasks /data/logs /data/index \
 && ln -sf /opt/lightnovel/test/fixtures /opt/fixtures

VOLUME ["/data"]
EXPOSE 3080

ENTRYPOINT ["/usr/local/bin/ln-entrypoint.sh"]
# Default: dump the composed config so `docker compose up` verifies the install
# without needing an LLM API key. Override `command:` to actually run DSH.
CMD ["--profile", "nas", "--dump-config"]
