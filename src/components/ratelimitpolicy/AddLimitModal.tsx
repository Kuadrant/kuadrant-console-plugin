import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  TextInput,
  Title,
} from '@patternfly/react-core';
import * as React from 'react';
import { Counter, LimitConfig, Predicate, Rate } from './types';
import { useTranslation } from 'react-i18next';
import { validateK8sName } from '../../utils/validation';

const windowPattern = /^([0-9]{1,5}(h|m|s|ms)){1,4}$/;

const AddLimitModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  newLimit: LimitConfig;
  setNewLimit: (limit: LimitConfig) => void;
  rateName: string;
  setRateName: (name: string) => void;
  handleSave: () => void;
  existingLimitNames?: string[];
}> = ({
  isOpen,
  onClose,
  newLimit,
  setNewLimit,
  rateName,
  setRateName,
  handleSave,
  existingLimitNames = [],
}) => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [newLimitValue, setNewLimitValue] = React.useState<number | ''>('');
  const [newLimitWindow, setNewLimitWindow] = React.useState('');
  const [newCounterExpression, setNewCounterExpression] = React.useState('');
  const [newWhenPredicate, setNewWhenPredicate] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setNewLimitValue('');
      setNewLimitWindow('');
      setNewCounterExpression('');
      setNewWhenPredicate('');
    }
  }, [isOpen]);

  const rates = newLimit.rates || [];
  const counters = newLimit.counters || [];
  const when = newLimit.when || [];

  const isDuplicateName = rateName !== '' && existingLimitNames.includes(rateName);
  const nameFormatError = rateName !== '' ? validateK8sName(rateName) : null;
  const hasNameError = isDuplicateName || nameFormatError !== null;
  const isValidWindow = newLimitWindow === '' || windowPattern.test(newLimitWindow);
  const isSaveDisabled = !rateName || rates.length === 0 || hasNameError;

  const handleAddRate = () => {
    if (newLimitValue !== '' && newLimitWindow && windowPattern.test(newLimitWindow)) {
      const nextRate: Rate = { limit: Number(newLimitValue), window: newLimitWindow };
      setNewLimit({
        ...newLimit,
        rates: [...rates, nextRate],
      });
      setNewLimitValue('');
      setNewLimitWindow('');
    }
  };

  const handleRemoveRate = (index: number) => {
    setNewLimit({
      ...newLimit,
      rates: rates.filter((_, i) => i !== index),
    });
  };

  const handleAddCounter = () => {
    if (newCounterExpression.trim()) {
      const nextCounter: Counter = { expression: newCounterExpression.trim() };
      setNewLimit({
        ...newLimit,
        counters: [...counters, nextCounter],
      });
      setNewCounterExpression('');
    }
  };

  const handleRemoveCounter = (index: number) => {
    setNewLimit({
      ...newLimit,
      counters: counters.filter((_, i) => i !== index),
    });
  };

  const handleAddWhen = () => {
    if (newWhenPredicate.trim()) {
      const nextWhen: Predicate = { predicate: newWhenPredicate.trim() };
      setNewLimit({
        ...newLimit,
        when: [...when, nextWhen],
      });
      setNewWhenPredicate('');
    }
  };

  const handleRemoveWhen = (index: number) => {
    setNewLimit({
      ...newLimit,
      when: when.filter((_, i) => i !== index),
    });
  };

  return (
    <Modal
      title={t('Add Limit')}
      isOpen={isOpen}
      onClose={onClose}
      variant="small"
      aria-label={t('Add rate limit')}
    >
      <ModalBody>
        <Form>
          <FormGroup label={t('Limit Name')} isRequired fieldId="new-limit-name">
            <TextInput
              isRequired
              type="text"
              id="new-limit-name"
              value={rateName}
              onChange={(_event, value) => setRateName(value)}
              placeholder={t('Limit Name')}
              validated={hasNameError ? 'error' : 'default'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={hasNameError ? 'error' : 'default'}>
                  {isDuplicateName
                    ? t('A limit with this name already exists')
                    : nameFormatError
                    ? t(nameFormatError)
                    : t('Unique identifier for this rate limit')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <Title headingLevel="h3" size="md">
            {t('Rates')}
          </Title>
          <LabelGroup numLabels={10}>
            {rates.map((rate, i) => (
              <Label key={i} color="blue" onClose={() => handleRemoveRate(i)}>
                {t('{{limit}} per {{window}}', { limit: rate.limit, window: rate.window })}
              </Label>
            ))}
          </LabelGroup>
          <FormGroup label={t('Limit')} isRequired fieldId="new-limit-value">
            <TextInput
              isRequired
              type="text"
              id="new-limit-value"
              value={newLimitValue === '' ? '' : String(newLimitValue)}
              onChange={(_event, value) => {
                if (value === '' || /^\d+$/.test(value)) {
                  setNewLimitValue(value === '' ? '' : Number(value));
                }
              }}
              placeholder={t('Limit value')}
              validated={newLimitValue !== '' && Number(newLimitValue) <= 0 ? 'error' : 'default'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('Maximum number of requests allowed in the time window')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label={t('Window')} isRequired fieldId="new-limit-window">
            <TextInput
              isRequired
              type="text"
              id="new-limit-window"
              value={newLimitWindow}
              onChange={(_event, value) => setNewLimitWindow(value)}
              placeholder={t('e.g. 1h, 60s, 500ms, 1h30m')}
              validated={isValidWindow ? 'default' : 'error'}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={isValidWindow ? 'default' : 'error'}>
                  {isValidWindow
                    ? t('Time window for the rate limit (e.g. 1h, 60s, 1440m)')
                    : t('Format must be like: 1h, 60s, 500ms, or 1h30m')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <Button
            variant="secondary"
            onClick={handleAddRate}
            isDisabled={
              newLimitValue === '' ||
              Number(newLimitValue) <= 0 ||
              !newLimitWindow ||
              !isValidWindow
            }
          >
            {t('Add Rate')}
          </Button>

          <Title headingLevel="h3" size="md" className="pf-v6-u-mt-md">
            {t('Counters')}
          </Title>
          <LabelGroup numLabels={10}>
            {counters.map((counter, i) => (
              <Label key={i} color="green" onClose={() => handleRemoveCounter(i)}>
                {counter.expression}
              </Label>
            ))}
          </LabelGroup>
          <FormGroup label={t('Counter expression')} fieldId="new-counter-expression">
            <TextInput
              type="text"
              id="new-counter-expression"
              value={newCounterExpression}
              onChange={(_event, value) => setNewCounterExpression(value)}
              placeholder={t('e.g. auth.identity.username')}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('CEL expression used as a rate limiting counter qualifier')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <Button
            variant="secondary"
            onClick={handleAddCounter}
            isDisabled={!newCounterExpression.trim()}
          >
            {t('Add Counter')}
          </Button>

          <Title headingLevel="h3" size="md" className="pf-v6-u-mt-md">
            {t('Conditions')}
          </Title>
          <LabelGroup numLabels={10}>
            {when.map((condition, i) => (
              <Label key={i} color="orange" onClose={() => handleRemoveWhen(i)}>
                {condition.predicate}
              </Label>
            ))}
          </LabelGroup>
          <FormGroup label={t('When predicate')} fieldId="new-when-predicate">
            <TextInput
              type="text"
              id="new-when-predicate"
              value={newWhenPredicate}
              onChange={(_event, value) => setNewWhenPredicate(value)}
              placeholder={t('e.g. request.path.startsWith("/api")')}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('CEL expression that must evaluate to true for this limit to apply')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <Button variant="secondary" onClick={handleAddWhen} isDisabled={!newWhenPredicate.trim()}>
            {t('Add Condition')}
          </Button>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button key="save" variant="primary" onClick={handleSave} isDisabled={isSaveDisabled}>
          {t('Save Limit')}
        </Button>
        <Button key="cancel" variant="link" onClick={onClose}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default AddLimitModal;
