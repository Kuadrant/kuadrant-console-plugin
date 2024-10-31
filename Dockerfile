FROM registry.access.redhat.com/ubi9/nodejs-20:latest AS build

USER root

RUN dnf update -y && dnf upgrade -y && \
    command -v yarn || npm install -g yarn

RUN yarn config set network-concurrency 1 && \
    yarn config set network-timeout 100000

WORKDIR /usr/src/app
ADD package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-optional

ADD . .
RUN yarn build

FROM registry.access.redhat.com/ubi9/nginx-124:latest

USER root

RUN dnf update -y && dnf upgrade -y

COPY --from=build /usr/src/app/dist /usr/share/nginx/html
COPY entrypoint.sh /usr/share/nginx/html/entrypoint.sh

USER 1001
ENTRYPOINT ["/usr/share/nginx/html/entrypoint.sh"]
