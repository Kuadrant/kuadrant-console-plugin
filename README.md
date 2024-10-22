# Kuadrant OpenShift/OKD Console Plugin

See below for setup requirements.

Based on https://github.com/openshift/console-plugin-template

## Running

- Target a running OCP with `oc login`
- `yarn run start` # start webpack
- `yarn run start-console` # start local ocp console + proxy

# Requirements for running locally

[Node.js](https://nodejs.org/en/) and [yarn](https://yarnpkg.com) are required
to build and run this locally. To run OpenShift console in a container, either
[Docker](https://www.docker.com) or [podman 3.2.0+](https://podman.io) and
[oc](https://console.redhat.com/openshift/downloads) are required.

## Getting started

### Option 1: Local

In one terminal window, run:

1. `yarn install`
2. `yarn run start`

In another terminal window, run:

1. `oc login` (requires [oc](https://console.redhat.com/openshift/downloads) and an [OpenShift cluster](https://console.redhat.com/openshift/create))
2. `yarn run start-console` (requires [Docker](https://www.docker.com) or [podman 3.2.0+](https://podman.io))

This will run the OpenShift console in a container connected to the cluster
you've logged into. The plugin HTTP server runs on port 9001 with CORS enabled.
Navigate to <http://localhost:9000/example> to see the running plugin.

### Option 2: Docker + VSCode Remote Container

Make sure the
[Remote Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
extension is installed. This method uses Docker Compose where one container is
the OpenShift console and the second container is the plugin. It requires that
you have access to an existing OpenShift cluster. After the initial build, the
cached containers will help you start developing in seconds.

1. Create a `dev.env` file inside the `.devcontainer` folder with the correct values for your cluster:

```bash
OC_PLUGIN_NAME=console-plugin-template
OC_URL=https://api.example.com:6443
OC_USER=kubeadmin
OC_PASS=<password>
```

2. `(Ctrl+Shift+P) => Remote Containers: Open Folder in Container...`
3. `yarn run start`
4. Navigate to <http://localhost:9000/example>

## Docker image

Before you can deploy your plugin on a cluster, you must build an image and
push it to an image registry.

1. Build the image:

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t quay.io/kuadrant/console-plugin:latest --push .
```

2. Run the image:

```bash
docker run -it --rm -d -p 9001:80 quay.io/kuadrant/console-plugin:latest
```

NOTE: If you have a Mac with Apple silicon, you will need to add the flag
`--platform=linux/amd64` when building the image to target the correct platform
to run in-cluster.

## Deployment on cluster

Two easy ways to deploy.

### Via `kubectl` or `oc`

`oc apply -f install.yaml`

or

`kubectl apply -f install.yaml`

### Via the [`kuadrant-operator`](https://www.github.com/kuadrant/kuadrant-operator)

Install via the [`kuadrant-operator`](https://www.github.com/kuadrant/kuadrant-operator). If the operator detects it is running on OKD or OpenShift, the operator will automatically configure and install the plugin. You will need to enable it in Cluster Settings.

## i18n

The plugin template demonstrates how you can translate messages in with [react-i18next](https://react.i18next.com/). The i18n namespace must match
the name of the `ConsolePlugin` resource with the `plugin__` prefix to avoid
naming conflicts. For example, the plugin template uses the
`plugin__kuadrant-console` namespace. You can use the `useTranslation` hook
with this namespace as follows:

```tsx
conster Header: React.FC = () => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  return <h1>{t('Hello, World!')}</h1>;
};
```

For labels in `console-extensions.json`, you can use the format
`%plugin__kuadrant-console-plugin~My Label%`. Console will replace the value with
the message for the current language from the `plugin__kuadrant-console`
namespace. For example:

```json
{
  "type": "console.navigation/section",
  "properties": {
    "id": "admin-demo-section",
    "perspective": "admin",
    "name": "%plugin__kuadrant-console-plugin~Plugin Template%"
  }
}
```

Running `yarn i18n` updates the JSON files in the `locales` folder of the
plugin template when adding or changing messages.

## Linting

This project adds prettier, eslint, and stylelint. Linting can be run with
`yarn run lint`.

The stylelint config disallows hex colors since these cause problems with dark
mode (starting in OpenShift console 4.11). You should use the
[PatternFly global CSS variables](https://patternfly-react-main.surge.sh/developer-resources/global-css-variables#global-css-variables)
for colors instead.

The stylelint config also disallows naked element selectors like `table` and
`.pf-` or `.co-` prefixed classes. This prevents plugins from accidentally
overwriting default console styles, breaking the layout of existing pages. The
best practice is to prefix your CSS classnames with your plugin name to avoid
conflicts. Please don't disable these rules without understanding how they can
break console styles!

### Linting Extensions

If you'd like to auto lint, install these VSCode extensions and configure formatting on save:

- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Stylelint](https://marketplace.visualstudio.com/items?itemName=stylelint.vscode-stylelint)

#### Format on save in VSCode:

Update `settings.json` (File > Preferences > Settings):

```json
"editor.formatOnSave": true
```

## References

- [Console Plugin SDK README](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk)
- [Customization Plugin Example](https://github.com/spadgett/console-customization-plugin)
- [Dynamic Plugin Enhancement Proposal](https://github.com/openshift/enhancements/blob/master/enhancements/console/dynamic-plugins.md)
- [Console Plugin Template](https://github.com/openshift/console-plugin-template)
