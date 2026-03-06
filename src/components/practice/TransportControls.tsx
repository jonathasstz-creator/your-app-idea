import React from 'react';
import { Button } from '../shared/Button';
import { PracticeMode } from '../../types/practice.types';

interface Props {
  mode: PracticeMode;
  onPlay: () => void;
  onPause: () => void;
  onReload: () => void;
  onModeChange: () => void;
}

export const TransportControls: React.FC<Props> = ({ mode, onPlay, onPause, onReload, onModeChange }) => (
  <div className="flex gap-2 items-center">
    <Button onClick={onPlay}>Play</Button>
    <Button variant="secondary" onClick={onPause}>Pause</Button>
    <Button variant="secondary" onClick={onReload}>Reload</Button>
    <Button variant="ghost" onClick={onModeChange}>Modo: {mode}</Button>
  </div>
);
