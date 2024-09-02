
import {
    k8sCreate,
    K8sModel,
} from '@openshift-console/dynamic-plugin-sdk';
import { History } from 'history';


export function handleCreate(model: K8sModel, data, namespace: string, policyType: string, history: History) {
    type model = K8sModel
    type data = {
        apiVersion: string;
        kind: string;
        metadata: {
            name: string;
            namespace: string;
        };
        spec: {
            [key: string]: any;
        };

    };
    type namespace = string
    try {
        k8sCreate({
            model: model,
            data: data,
            ns: namespace,
        });
        console.log('Policy created successfully', model.kind);
        history.push(`/k8s/ns/${namespace}/kuadrant.io~v1alpha1~${policyType}/${data.metadata.name}`)
    } catch (error) {
        console.error('Failed to create Policy:', error);
    }
};
