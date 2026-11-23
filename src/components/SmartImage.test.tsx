import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SmartImage } from './SmartImage';

describe('SmartImage', () => {
  it('muestra loader animado mientras carga y oculta al terminar de cargar', () => {
    const { container } = render(
      <SmartImage src="https://example.com/slow.webp" alt="Tenis Jordan" />
    );

    const img = screen.getByAltText('Tenis Jordan');
    expect(img).toHaveClass('is-loading');
    expect(container.querySelector('.smart-img-loader')).toBeInTheDocument();
    expect(container.querySelector('.smart-img-spinner')).toBeInTheDocument();

    fireEvent.load(img);
    expect(img).toHaveClass('is-loaded');
    expect(container.querySelector('.smart-img-loader')).not.toBeInTheDocument();
  });

  it('reintenta una vez automáticamente y muestra botón Reintentar si falla', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <SmartImage
          src="https://example.com/broken.webp"
          alt="Tenis Rota"
          showRetryOnError
        />
      );

      const img = screen.getByAltText('Tenis Rota');
      fireEvent.error(img);

      // Reintento automático tras 1.4s
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(img).toHaveAttribute('src', 'https://example.com/broken.webp?r=1');

      // Si vuelve a fallar, muestra fallback amigable con botón Reintentar
      fireEvent.error(img);
      expect(container.querySelector('.smart-img-fallback')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', {
        name: 'Reintentar cargar Tenis Rota',
      });
      fireEvent.click(retryBtn);
      expect(img).toHaveAttribute('src', 'https://example.com/broken.webp?r=2');
      expect(container.querySelector('.smart-img-loader')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
