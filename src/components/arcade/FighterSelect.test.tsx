import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import FighterSelect from './FighterSelect';

describe('FighterSelect', () => {
  it('shows locked fighters and only selects an available one', () => {
    const onSelect = jest.fn();
    render(
      <FighterSelect
        availability={[
          { portraitIndex: 0, isAvailable: false, lockReason: 'after-lunch' },
          { portraitIndex: 1, isAvailable: true },
          { portraitIndex: 2, isAvailable: true },
          { portraitIndex: 3, isAvailable: true },
          { portraitIndex: 4, isAvailable: true },
        ]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('Lunch service has commenced')).toBeTruthy();
    fireEvent.click(screen.getByText('Jason'));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Anton'));
    expect(onSelect).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByText('Emma'));
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});
