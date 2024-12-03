FROM registry.access.redhat.com/ubi9:latest

USER root

RUN dnf update -y && \
    dnf upgrade -y && \
    dnf module enable nodejs:20 nginx:1.24 -y && \
    dnf install -y nodejs nginx && \
    npm install -g yarn

RUN yarn config set network-concurrency 1 && \
    yarn config set network-timeout 100000

RUN mkdir -p /var/cache/nginx /var/log/nginx /run && \
    chmod -R 777 /var/cache/nginx /var/log/nginx /run

WORKDIR /usr/src/app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-optional

COPY . .

RUN yarn build

RUN cp -r dist /usr/share/nginx/html
COPY entrypoint.sh /usr/share/nginx/html/entrypoint.sh

USER 1001
ENTRYPOINT ["/usr/share/nginx/html/entrypoint.sh"]
