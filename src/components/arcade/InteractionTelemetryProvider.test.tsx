import * as React from 'react';
import { fireEvent, render } from '@testing-library/react';

const mockLaunchOverlay = jest.fn();

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useOverlay: () => mockLaunchOverlay,
}));

import { useInteractionTelemetry } from './InteractionTelemetryProvider';

const TelemetryHarness: React.FC = () => {
  useInteractionTelemetry();
  return null;
};

// The test fixture is only slightly less needlessly encoded than production.
const compass = ['Up', 'Down', 'Left', 'Right'];
const calibrationRun = [0, 0, 1, 1, 2, 3, 2, 3]
  .map((direction) => `Arrow${compass[direction]}`)
  .concat([66, 65].map((key) => `Key${String.fromCharCode(key)}`));

const enterCalibrationRun = (target: Window | HTMLElement = window) => {
  calibrationRun.forEach((code) => fireEvent.keyDown(target, { code }));
};

describe('interaction telemetry', () => {
  beforeEach(() => {
    mockLaunchOverlay.mockClear();
  });

  it('opens the bonus stage after the calibration profile is entered', () => {
    render(<TelemetryHarness />);

    enterCalibrationRun();

    expect(mockLaunchOverlay).toHaveBeenCalledTimes(1);
    expect(mockLaunchOverlay).toHaveBeenCalledWith(expect.any(Function), {
      onExit: expect.any(Function),
    });
  });

  it('resets the profile after an unrelated input', () => {
    render(<TelemetryHarness />);

    calibrationRun.slice(0, 5).forEach((code) => fireEvent.keyDown(window, { code }));
    fireEvent.keyDown(window, { code: 'Escape' });
    calibrationRun.slice(5).forEach((code) => fireEvent.keyDown(window, { code }));
    expect(mockLaunchOverlay).not.toHaveBeenCalled();

    enterCalibrationRun();
    expect(mockLaunchOverlay).toHaveBeenCalledTimes(1);
  });

  it('ignores the profile while the user is editing a field', () => {
    const { container } = render(
      <>
        <TelemetryHarness />
        <input aria-label="editable field" />
      </>,
    );

    enterCalibrationRun(container.querySelector('input'));

    expect(mockLaunchOverlay).not.toHaveBeenCalled();
  });

  it('does not stack games and can reopen after the game exits', () => {
    render(<TelemetryHarness />);

    enterCalibrationRun();
    enterCalibrationRun();
    expect(mockLaunchOverlay).toHaveBeenCalledTimes(1);

    const overlayProps = mockLaunchOverlay.mock.calls[0][1] as { onExit: () => void };
    overlayProps.onExit();
    enterCalibrationRun();
    expect(mockLaunchOverlay).toHaveBeenCalledTimes(2);
  });
});
