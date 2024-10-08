FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
USER root
RUN command -v yarn || npm i -g yarn

ADD . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install && yarn build

FROM registry.access.redhat.com/ubi9/nginx-124:1-10

COPY --from=build /usr/src/app/dist /usr/share/nginx/html

COPY entrypoint.sh /usr/share/nginx/html/entrypoint.sh

USER 1001

ENTRYPOINT ["/usr/share/nginx/html/entrypoint.sh"]
