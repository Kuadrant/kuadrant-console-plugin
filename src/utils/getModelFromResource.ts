import { K8sModel, K8sResourceCommon } from "@openshift-console/dynamic-plugin-sdk";

const getModelFromResource = (obj: K8sResourceCommon): K8sModel => {
    const pluralizeKind = (kind: string) => {
        if (kind.endsWith('y')) {
            return `${kind.slice(0, -1)}ies`.toLowerCase();
        }
        return `${kind.toLowerCase()}s`;
    };

    return {
        apiGroup: obj.apiVersion.split('/')[0],
        apiVersion: obj.apiVersion.split('/')[1],
        kind: obj.kind,
        plural: pluralizeKind(obj.kind),
        namespaced: !!obj.metadata.namespace,
        abbr: obj.kind.charAt(0),
        label: obj.kind,
        labelPlural: pluralizeKind(obj.kind),
    };
};

export default getModelFromResource;
