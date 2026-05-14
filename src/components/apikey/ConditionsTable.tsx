import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { Condition } from './types';

interface ConditionsTableProps {
  conditions: Condition[];
}

const ConditionsTable: React.FC<ConditionsTableProps> = ({ conditions }) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');

  if (!conditions || conditions.length === 0) {
    return (
      <div className="co-m-pane__body">
        <p className="text-muted">{t('No conditions')}</p>
      </div>
    );
  }

  return (
    <Table variant="compact" borders={true}>
      <Thead>
        <Tr>
          <Th>{t('Type')}</Th>
          <Th>{t('Status')}</Th>
          <Th>{t('Reason')}</Th>
          <Th>{t('Message')}</Th>
          <Th>{t('Last Transition')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {conditions.map((condition, index) => (
          <Tr key={index}>
            <Td dataLabel={t('Type')}>{condition.type}</Td>
            <Td dataLabel={t('Status')}>{condition.status}</Td>
            <Td dataLabel={t('Reason')}>{condition.reason || '-'}</Td>
            <Td dataLabel={t('Message')}>{condition.message || '-'}</Td>
            <Td dataLabel={t('Last Transition')}>
              {condition.lastTransitionTime ? (
                <Timestamp timestamp={condition.lastTransitionTime} />
              ) : (
                '-'
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default ConditionsTable;
