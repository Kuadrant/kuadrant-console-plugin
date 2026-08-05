import * as React from 'react';
import type { TFunction } from 'react-i18next';

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  BuildIcon,
  UploadIcon,
  PendingIcon,
} from '@patternfly/react-icons';

import { Label, Tooltip } from '@patternfly/react-core';

const POLICIES_MAP: Record<string, string[]> = {
  Gateway: [
    'kuadrant.io/DNSPolicyAffected',
    'kuadrant.io/TLSPolicyAffected',
    'kuadrant.io/AuthPolicyAffected',
    'kuadrant.io/RateLimitPolicyAffected',
    'kuadrant.io/TokenRateLimitPolicyAffected',
  ],
  HTTPRoute: [
    'kuadrant.io/AuthPolicyAffected',
    'kuadrant.io/RateLimitPolicyAffected',
    'kuadrant.io/TokenRateLimitPolicyAffected',
  ],
  GRPCRoute: [
    'kuadrant.io/AuthPolicyAffected',
    'kuadrant.io/RateLimitPolicyAffected',
    'kuadrant.io/TokenRateLimitPolicyAffected',
  ],
};

const hasAllPoliciesEnforced = (policiesAffected: string[], conditions): boolean => {
  const relevant = policiesAffected.filter((p) => conditions.some((c) => c.type === p));
  return relevant.every((p) => conditions.some((c) => c.type === p && c.status === 'True'));
};

const hasAnyPolicyError = (policiesAffected: string[], conditions): boolean =>
  policiesAffected.some((p) => conditions.some((c) => c.type === p && c.status === 'False'));

const generateLabelWithTooltip = (labelText, color, icon, tooltipText) => {
  return (
    <Tooltip content={tooltipText} position="top" enableFlip>
      <Label isCompact icon={icon} color={color}>
        {labelText}
      </Label>
    </Tooltip>
  );
};

const getStatusLabel = (t: TFunction, obj) => {
  const tooltipTexts = {
    Enforced: t('The resource is accepted, programmed, and all policies are enforced.'),
    'Accepted (Not Enforced)': t('The resource is accepted but not all policies are enforced.'),
    Programmed: t('The resource is programmed but not fully enforced.'),
    Conflicted: t('There is a conflict on the resource.'),
    'Resolved Refs': t('All references for the resource have been resolved.'),
    Unknown: t('The status of the resource is unknown.'),
    Creating: t('The resource is being created.'),
    'Overridden (Not Enforced)': t('The resource is overridden and not enforced.'),
    'Conflicted (Not Accepted)': t('There is a conflict and the resource is not accepted.'),
    'TargetNotFound (Not Accepted)': t(
      'The target for the resource was not found and it is not accepted.',
    ),
    'Unknown (Not Accepted)': t('The resource has an unknown status and is not accepted.'),
    'Invalid (Not Accepted)': t('The resource is invalid and not accepted.'),
  };

  const { kind, status } = obj;
  const policiesAffected = POLICIES_MAP[kind] || [];

  if (kind === 'Gateway') {
    const conditions = status?.conditions || [];

    const acceptedCondition = conditions.find(
      (cond) => cond.type === 'Accepted' && cond.status === 'True',
    );
    const programmedCondition = conditions.find(
      (cond) => cond.type === 'Programmed' && cond.status === 'True',
    );

    if (acceptedCondition && programmedCondition) {
      if (
        hasAllPoliciesEnforced(policiesAffected, conditions) &&
        !hasAnyPolicyError(policiesAffected, conditions)
      ) {
        return generateLabelWithTooltip(
          'Enforced',
          'green',
          <CheckCircleIcon />,
          tooltipTexts['Enforced'],
        );
      } else {
        return generateLabelWithTooltip(
          'Accepted (Not Enforced)',
          'purple',
          <UploadIcon />,
          tooltipTexts['Accepted (Not Enforced)'],
        );
      }
    } else if (programmedCondition) {
      return generateLabelWithTooltip(
        'Programmed',
        'blue',
        <CheckCircleIcon />,
        tooltipTexts['Programmed'],
      );
    } else if (conditions.some((cond) => cond.type === 'Conflicted' && cond.status === 'True')) {
      return generateLabelWithTooltip(
        'Conflicted',
        'red',
        <ExclamationTriangleIcon />,
        tooltipTexts['Conflicted'],
      );
    } else if (conditions.some((cond) => cond.type === 'ResolvedRefs' && cond.status === 'True')) {
      return generateLabelWithTooltip(
        'Resolved Refs',
        'blue',
        <CheckCircleIcon />,
        tooltipTexts['Resolved Refs'],
      );
    } else {
      return generateLabelWithTooltip(
        'Unknown',
        'orange',
        <ExclamationTriangleIcon />,
        tooltipTexts['Unknown'],
      );
    }
  }

  if (policiesAffected.length > 0) {
    const parentConditions = status?.parents?.flatMap((parent) => parent.conditions) || [];

    const acceptedCondition = parentConditions.find(
      (cond) => cond.type === 'Accepted' && cond.status === 'True',
    );
    const conflictedCondition = parentConditions.find(
      (cond) => cond.type === 'Conflicted' && cond.status === 'True',
    );
    const resolvedRefsCondition = parentConditions.find(
      (cond) => cond.type === 'ResolvedRefs' && cond.status === 'True',
    );

    if (acceptedCondition) {
      if (
        hasAllPoliciesEnforced(policiesAffected, parentConditions) &&
        !hasAnyPolicyError(policiesAffected, parentConditions)
      ) {
        return generateLabelWithTooltip(
          'Enforced',
          'green',
          <CheckCircleIcon />,
          tooltipTexts['Enforced'],
        );
      } else {
        return generateLabelWithTooltip(
          'Accepted (Not Enforced)',
          'purple',
          <UploadIcon />,
          tooltipTexts['Accepted (Not Enforced)'],
        );
      }
    } else if (conflictedCondition) {
      return generateLabelWithTooltip(
        'Conflicted',
        'red',
        <ExclamationTriangleIcon />,
        tooltipTexts['Conflicted'],
      );
    } else if (resolvedRefsCondition) {
      return generateLabelWithTooltip(
        'Resolved Refs',
        'blue',
        <CheckCircleIcon />,
        tooltipTexts['Resolved Refs'],
      );
    } else {
      return generateLabelWithTooltip(
        'Unknown',
        'orange',
        <ExclamationTriangleIcon />,
        tooltipTexts['Unknown'],
      );
    }
  }

  const generalConditions = status?.conditions || [];

  if (generalConditions.length === 0) {
    return generateLabelWithTooltip('Creating', 'cyan', <PendingIcon />, tooltipTexts['Creating']);
  }

  const enforcedCondition = generalConditions.find(
    (cond) => cond.type === 'Enforced' && cond.status === 'True',
  );
  const acceptedCondition = generalConditions.find(
    (cond) => cond.type === 'Accepted' && cond.status === 'True',
  );
  const acceptedConditionFalse = generalConditions.find(
    (cond) => cond.type === 'Accepted' && cond.status === 'False',
  );
  const overriddenCondition = generalConditions.find(
    (cond) => cond.reason === 'Overridden' && cond.status === 'False',
  );
  const conflictedCondition = generalConditions.find(
    (cond) => cond.reason === 'Conflicted' && cond.status === 'False',
  );
  const targetNotFoundCondition = generalConditions.find(
    (cond) => cond.reason === 'TargetNotFound' && cond.status === 'False',
  );
  const unknownCondition = generalConditions.find(
    (cond) => cond.reason === 'Unknown' && cond.status === 'False',
  );

  if (enforcedCondition) {
    return generateLabelWithTooltip(
      'Enforced',
      'green',
      <CheckCircleIcon />,
      tooltipTexts['Enforced'],
    );
  } else if (overriddenCondition) {
    return generateLabelWithTooltip(
      'Overridden (Not Enforced)',
      'grey',
      <BuildIcon />,
      tooltipTexts['Overridden (Not Enforced)'],
    );
  } else if (acceptedCondition) {
    return generateLabelWithTooltip(
      'Accepted (Not Enforced)',
      'purple',
      <UploadIcon />,
      tooltipTexts['Accepted (Not Enforced)'],
    );
  } else if (conflictedCondition) {
    return generateLabelWithTooltip(
      'Conflicted (Not Accepted)',
      'red',
      <ExclamationTriangleIcon />,
      tooltipTexts['Conflicted (Not Accepted)'],
    );
  } else if (targetNotFoundCondition) {
    return generateLabelWithTooltip(
      'TargetNotFound (Not Accepted)',
      'red',
      <ExclamationTriangleIcon />,
      tooltipTexts['TargetNotFound (Not Accepted)'],
    );
  } else if (unknownCondition) {
    return generateLabelWithTooltip(
      'Unknown (Not Accepted)',
      'orange',
      <ExclamationTriangleIcon />,
      tooltipTexts['Unknown (Not Accepted)'],
    );
  } else if (acceptedConditionFalse) {
    return generateLabelWithTooltip(
      'Invalid (Not Accepted)',
      'red',
      <ExclamationTriangleIcon />,
      tooltipTexts['Invalid (Not Accepted)'],
    );
  } else {
    return generateLabelWithTooltip(
      'Unknown',
      'grey',
      <ExclamationTriangleIcon />,
      tooltipTexts['Unknown'],
    );
  }
};

const getStatusSortRank = (obj): number => {
  const { kind, status } = obj;
  const policiesAffected = POLICIES_MAP[kind] || [];

  if (kind === 'Gateway') {
    const conditions = status?.conditions || [];
    const accepted = conditions.some((c) => c.type === 'Accepted' && c.status === 'True');
    const programmed = conditions.some((c) => c.type === 'Programmed' && c.status === 'True');
    if (accepted && programmed) {
      return hasAllPoliciesEnforced(policiesAffected, conditions) &&
        !hasAnyPolicyError(policiesAffected, conditions)
        ? 8
        : 6;
    }
    if (programmed) return 5;
    if (conditions.some((c) => c.type === 'Conflicted' && c.status === 'True')) return 2;
    if (conditions.some((c) => c.type === 'ResolvedRefs' && c.status === 'True')) return 4;
    return 1;
  }

  if (policiesAffected.length > 0) {
    const parentConditions = status?.parents?.flatMap((p) => p.conditions) || [];
    const accepted = parentConditions.some((c) => c.type === 'Accepted' && c.status === 'True');
    if (accepted) {
      return hasAllPoliciesEnforced(policiesAffected, parentConditions) &&
        !hasAnyPolicyError(policiesAffected, parentConditions)
        ? 8
        : 6;
    }
    if (parentConditions.some((c) => c.type === 'Conflicted' && c.status === 'True')) return 2;
    if (parentConditions.some((c) => c.type === 'ResolvedRefs' && c.status === 'True')) return 4;
    return 1;
  }

  const conditions = status?.conditions || [];
  if (conditions.length === 0) return 0;
  if (conditions.some((c) => c.type === 'Enforced' && c.status === 'True')) return 8;
  if (conditions.some((c) => c.reason === 'Overridden' && c.status === 'False')) return 3;
  if (conditions.some((c) => c.type === 'Accepted' && c.status === 'True')) return 6;
  if (conditions.some((c) => c.reason === 'Conflicted' && c.status === 'False')) return 2;
  if (conditions.some((c) => c.reason === 'TargetNotFound' && c.status === 'False')) return 2;
  if (conditions.some((c) => c.reason === 'Unknown' && c.status === 'False')) return 1;
  if (conditions.some((c) => c.type === 'Accepted' && c.status === 'False')) return 1;
  return 1;
};

export { getStatusLabel, getStatusSortRank };
