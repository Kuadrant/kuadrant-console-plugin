FROM registry.access.redhat.com/ubi9:latest

USER root

RUN dnf update -y && dnf upgrade -y && \
    dnf module enable nodejs:20 nginx:1.24 -y && \
    dnf install -y nodejs nginx && \
    npm install -g yarn

RUN yarn config set network-concurrency 1 && \
    yarn config set network-timeout 100000

RUN mkdir -p /var/cache/nginx /var/log/nginx /run && \
    chmod -R 777 /var/cache/nginx /var/log/nginx /run

WORKDIR /usr/src/app
ADD package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-optional

ADD . .

ARG CACHE_BUST=1

RUN yarn build && \
    echo "Build completed. Current directory contents:" && ls -la && \
    echo "Contents of the dist directory:" && ls -la dist || echo "dist directory not found"

COPY dist /usr/share/nginx/html
COPY entrypoint.sh /usr/share/nginx/html/entrypoint.sh

USER 1001
ENTRYPOINT ["/usr/share/nginx/html/entrypoint.sh"]
