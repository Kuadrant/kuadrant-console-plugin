import { FormGroup, Title, List, ListItem, Flex, FlexItem, Button, Modal } from "@patternfly/react-core";
import * as React from "react";
import AddLimitModal from "./AddLimitModal";
import { LimitConfig } from "./types";
import { useTranslation } from "react-i18next";

interface LimitSelectProps {
  limits: Record<string, LimitConfig>;
  setLimits: React.Dispatch<React.SetStateAction<Record<string, LimitConfig>>>;
}

const LimitSelect: React.FC<LimitSelectProps> = ({ limits, setLimits }) => {
  const { t } = useTranslation('plugin__console-plugin-template');
  const [isAddLimitModalOpen, setIsAddLimitModalOpen] = React.useState(false);
  const [isLimitNameAlertModalOpen, setIsLimitNameAlertModalOpen] = React.useState(false);
  // State to hold the temporary limit being added
  const [newLimit, setNewLimit] = React.useState<LimitConfig>({
    rates: [{ duration: 60, limit: 100, unit: 'minute' }]
  });
  const [rateName, setRateName] = React.useState<string>('');
  const handleOpenModal = () => {
    // Reset temporary state when opening modal for new entry
    setNewLimit({ rates: [{ duration: 60, limit: 100, unit: 'minute' }] });
    setRateName('');
    setIsAddLimitModalOpen(true);
  };
  const handleCloseModal = () => setIsAddLimitModalOpen(false);

  const onAddLimit = () => {
    if (!rateName) {
      // Show alert modal if rateName is empty
      setIsLimitNameAlertModalOpen(true);
      return;
    }

    // Append the new limit to the list of limits
    setLimits((prevLimits) => ({
      ...prevLimits,
      [rateName]: newLimit,
    }));

    // Close the modal after saving
    handleCloseModal();
  };

  // Handle removing a limit by name
  const handleRemoveLimit = (name: string) => {
    setLimits((prevLimits) => {
      const updatedLimits = { ...prevLimits };
      delete updatedLimits[name];
      return updatedLimits;
    });
  };

  return (
    <>
      <FormGroup>
        <Title headingLevel="h2" size="lg" style={{ marginTop: '20px' }}>{t('Configured Limits')}</Title>
        <List>
          {Object.keys(limits).length > 0 ? (
            Object.entries(limits).map(([name, limitConfig], index) => (
              <ListItem key={index}>
                <Flex>
                  <FlexItem>
                    <strong>{name}</strong>: {limitConfig.rates?.[0]?.limit} requests per {limitConfig.rates?.[0]?.duration} {limitConfig.rates?.[0]?.unit}(s)
                  </FlexItem>
                  <FlexItem>
                    {/* Button to remove a limit */}
                    <Button variant="danger" onClick={() => handleRemoveLimit(name)}>
                      {t('Remove Limit')}
                    </Button>
                  </FlexItem>
                </Flex>
              </ListItem>
            ))
          ) : (
            <ListItem>{t('No limits configured yet')}</ListItem>
          )}
        </List>
        <Button variant="primary" onClick={handleOpenModal}>
          {t('Add Limit')}
        </Button>
      </FormGroup>
      {/* Modal to add a new limit */}
      <AddLimitModal
        isOpen={isAddLimitModalOpen}
        onClose={handleCloseModal}
        newLimit={newLimit}
        setNewLimit={setNewLimit}
        rateName={rateName}
        setRateName={setRateName}
        handleSave={onAddLimit}
      />
      <Modal
        title="Validation Error"
        isOpen={isLimitNameAlertModalOpen}
        onClose={() => setIsLimitNameAlertModalOpen(false)}
        variant="small"
        aria-label="Rate Name is required error"
      >
        <p>{t('Limit Name is required!')}</p>
        <Button variant="primary" onClick={() => setIsLimitNameAlertModalOpen(false)}>
          {t('OK')}
        </Button>
      </Modal>
    </>
  );
};

export default LimitSelect;