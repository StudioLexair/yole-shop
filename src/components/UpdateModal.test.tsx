import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpdateModal } from './UpdateModal';
import type { EvaluatedUpdateState } from '../lib/versionManager';

const mandatoryState: EvaluatedUpdateState = {
  updateAvailable: true,
  mandatory: true,
  currentVersion: '1.0.0',
  currentBuildId: 'old123',
  targetVersion: '1.1.0',
  targetBuildId: 'new456',
  title: '¡Actualización disponible!',
  description: 'Actualiza Yole Shop para cargar las nuevas mecánicas y funciones.',
  features: ['Nuevo emblema Wolf Fire-Eye', 'Modo oscuro corregido'],
  source: 'manifest',
  manifest: null,
  remoteRelease: null,
};

describe('UpdateModal', () => {
  it('bloquea el cierre cuando la actualización es obligatoria', () => {
    const onClose = vi.fn();
    render(<UpdateModal open updateState={mandatoryState} onClosePreview={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Actualización obligatoria')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0 → v1.1.0')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Actualizar ahora para continuar/i })
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Cerrar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recordar más tarde/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
