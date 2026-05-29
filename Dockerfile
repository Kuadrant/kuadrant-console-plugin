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
RUN YARN_ENABLE_SCRIPTS=false yarn install --immutable

COPY . .

RUN yarn build

RUN test -f ./dist/plugin-manifest.json && \
    test -d ./dist/locales && \
    echo "All required files are present."

# Stage 2: Runtime image on target architecture
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest

RUN microdnf module enable nginx:1.24 -y && \
    microdnf install -y nginx && \
    microdnf clean all

RUN mkdir -p /var/cache/nginx /var/log/nginx /run && \
    chmod -R 777 /var/cache/nginx /var/log/nginx /run /usr/share/nginx/html/

COPY --from=builder /usr/src/app/dist/ /usr/share/nginx/html/
COPY entrypoint.sh /usr/share/nginx/html/entrypoint.sh

USER 1001
ENTRYPOINT ["/usr/share/nginx/html/entrypoint.sh"]
