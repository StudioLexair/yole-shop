import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpdateModal } from './UpdateModal';

describe('UpdateModal', () => {
  it('muestra versión limpia sin etiqueta de obligatoria y permite cerrar con Más tarde', () => {
    const onClose = vi.fn();
    render(
      <UpdateModal
        open
        onClosePreview={onClose}
        updateState={{
          updateAvailable: true,
          mandatory: false,
          currentVersion: '1.1.0',
          currentBuildId: 'old',
          targetVersion: '1.3.0',
          title: '¡Actualización disponible!',
          description: 'Nuevas funciones listas en Yole Shop.',
          features: ['Seguimiento de pedido con QR', 'Cupones VIP y Drops Flash'],
          source: 'remote-policy',
          manifest: null,
          remoteRelease: null,
        }}
      />
    );

    expect(screen.getByText('Nueva versión lista')).toBeInTheDocument();
    expect(screen.queryByText(/obligatoria/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Actualizar ahora/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
