# Stage 1: Build static assets on native amd64 (avoids QEMU emulation issues
# with OpenSSL/TLS when running dnf on ppc64le/s390x under emulation)
FROM --platform=linux/amd64 registry.access.redhat.com/ubi9/ubi:latest AS builder

USER root

RUN dnf module enable nodejs:22 -y && \
    dnf install -y nodejs npm gcc-c++ make python3 && \
    dnf clean all

RUN npm install -g corepack && \
    corepack enable

RUN yarn config set --home enableGlobalCache true

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches ./.yarn/patches
RUN YARN_ENABLE_SCRIPTS=false yarn install --immutable

COPY . .

RUN yarn build

RUN test -f ./dist/plugin-manifest.json && \
    test -d ./dist/locales && \
    echo "All required files are present."

# Stage 2: Build the small asset server and MCP relay on the target architecture.
FROM golang:1.24 AS go-builder

WORKDIR /usr/src/app
COPY go.mod ./
COPY cmd/plugin-server ./cmd/plugin-server
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /plugin-server ./cmd/plugin-server

# Stage 3: Runtime image on target architecture
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest

RUN mkdir -p /usr/share/kuadrant-console-plugin && \
    chown -R root:0 /usr/share/kuadrant-console-plugin && \
    chmod -R g+rX /usr/share/kuadrant-console-plugin

COPY --from=builder /usr/src/app/dist/ /usr/share/kuadrant-console-plugin/
COPY --from=go-builder /plugin-server /usr/local/bin/plugin-server

ARG QUAY_IMAGE_EXPIRY="never"
LABEL quay.expires-after=${QUAY_IMAGE_EXPIRY}

USER 1001
ENTRYPOINT ["/usr/local/bin/plugin-server"]
