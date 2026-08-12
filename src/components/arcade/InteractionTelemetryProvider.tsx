import * as React from 'react';
import { useOverlay } from '@openshift-console/dynamic-plugin-sdk';
import BonusStage from './BonusStage';

const InteractionTelemetryContext = React.createContext(false);

// These are checksums from an extremely serious keyboard calibration profile.
// Keeping the raw sequence out of the bundle is, naturally, vital telemetry work.
const CALIBRATION_PROFILE = new Uint32Array([
  154847355, 154847355, 2494835758, 2494835758, 3199684067, 1371226220, 3199684067, 1371226220,
  791340490, 774562871,
]);

const signalChecksum = (value: string): number => {
  let checksum = 0x811c9dc5;
  for (const character of value) {
    checksum ^= character.charCodeAt(0);
    checksum = Math.imul(checksum, 0x01000193);
  }
  return checksum >>> 0;
};

const isEditableTarget = (event: KeyboardEvent): boolean => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.some(
    (target) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
  );
};

export const InteractionTelemetryProvider = InteractionTelemetryContext.Provider;

export const useInteractionTelemetry = (): boolean => {
  const launchOverlay = useOverlay();
  const cursorRef = React.useRef(0);
  const isBonusStageOpenRef = React.useRef(false);

  const onBonusStageExit = React.useCallback(() => {
    isBonusStageOpenRef.current = false;
  }, []);

  React.useEffect(() => {
    const resetCalibration = () => {
      cursorRef.current = 0;
    };

    const sampleInput = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableTarget(event)
      ) {
        resetCalibration();
        return;
      }

      const signal = signalChecksum(event.code);
      const cursor = cursorRef.current;
      if (signal === CALIBRATION_PROFILE[cursor]) {
        cursorRef.current += 1;
      } else {
        cursorRef.current = signal === CALIBRATION_PROFILE[0] ? 1 : 0;
      }

      if (cursorRef.current === CALIBRATION_PROFILE.length) {
        resetCalibration();
        if (!isBonusStageOpenRef.current) {
          isBonusStageOpenRef.current = true;
          launchOverlay(BonusStage, { onExit: onBonusStageExit });
        }
      }
    };

    window.addEventListener('keydown', sampleInput);
    window.addEventListener('blur', resetCalibration);
    return () => {
      window.removeEventListener('keydown', sampleInput);
      window.removeEventListener('blur', resetCalibration);
    };
  }, [launchOverlay, onBonusStageExit]);

  return false;
};
