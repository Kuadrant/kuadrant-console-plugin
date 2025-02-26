import * as React from 'react';

import { useTranslation } from 'react-i18next';

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LayerGroupIcon,
  UploadIcon,
  OutlinedHourglassIcon,
} from '@patternfly/react-icons';

import { Label, Tooltip } from '@patternfly/react-core';

const generateLabelWithTooltip = (labelText, color, icon, tooltipText) => {
  return (
    <Tooltip content={tooltipText} position="top" enableFlip>
      <Label isCompact icon={icon} color={color}>
        {labelText}
      </Label>
    </Tooltip>
  );
};

const getStatusLabel = (obj) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

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

  const policiesMap = {
    Gateway: [
      'kuadrant.io/DNSPolicyAffected',
      'kuadrant.io/TLSPolicyAffected',
      'kuadrant.io/AuthPolicyAffected',
      'kuadrant.io/RateLimitPolicyAffected',
    ],
    HTTPRoute: ['kuadrant.io/AuthPolicyAffected', 'kuadrant.io/RateLimitPolicyAffected'],
  };

  const policiesAffected = policiesMap[kind] || [];

  const hasAllPoliciesEnforced = (conditions) => {
    const relevantPolicies = policiesAffected.filter((policy) =>
      conditions.some((cond) => cond.type === policy),
    );

    return relevantPolicies.every((policy) =>
      conditions.some((cond) => cond.type === policy && cond.status === 'True'),
    );
  };

  const hasAnyPolicyError = (conditions) => {
    return policiesAffected.some((policy) =>
      conditions.some((cond) => cond.type === policy && cond.status === 'False'),
    );
  };

  if (kind === 'Gateway') {
    const conditions = status?.conditions || [];

    const acceptedCondition = conditions.find(
      (cond) => cond.type === 'Accepted' && cond.status === 'True',
    );
    const programmedCondition = conditions.find(
      (cond) => cond.type === 'Programmed' && cond.status === 'True',
    );

    if (acceptedCondition && programmedCondition) {
      if (hasAllPoliciesEnforced(conditions) && !hasAnyPolicyError(conditions)) {
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
      if (hasAllPoliciesEnforced(parentConditions) && !hasAnyPolicyError(parentConditions)) {
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
    return generateLabelWithTooltip(
      'Creating',
      'cyan',
      <OutlinedHourglassIcon />,
      tooltipTexts['Creating'],
    );
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
      <LayerGroupIcon />,
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

export { getStatusLabel };
