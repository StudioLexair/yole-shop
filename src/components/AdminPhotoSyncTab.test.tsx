import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPhotoSyncTab } from './AdminPhotoSyncTab';
import type { Category, Product } from '../types';

const CAT: Category = {
  id: 'cat-1',
  name: 'Jordan',
  department: 'calzado',
  sort_order: 1,
};

const PROD: Product = {
  id: 'p-1',
  sku: 'YOL-035',
  title: 'Air Jordan 4 Black Cat Negro',
  brand: 'Jordan',
  category_id: 'cat-1',
  department: 'calzado',
  quality: '3A',
  cost_price: null,
  price: 30000,
  currency: 'CUP',
  sizes: ['38', '39', '40', '41', '42', '43'],
  sold_out_sizes: [],
  extra_images: [],
  video_url: undefined,
  fit_note: '',
  image_url: 'https://example.com/YOL-035.webp',
  image_path: 'catalog/YOL-035.webp',
  status: 'active',
  featured: false,
  price_preset_id: null,
  source_group: 'yole-whatsapp',
  sort_order: 35,
  created_at: '',
  updated_at: '',
};

describe('AdminPhotoSyncTab', () => {
  it('renderiza el sincronizador masivo $0 y permite elegir proveedor gratuito opcional', () => {
    render(
      <AdminPhotoSyncTab
        products={[PROD]}
        categories={[CAT]}
        onRefresh={vi.fn()}
        onNotify={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Sincronizador masivo por fotos/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Modo de análisis \(100% Gratis · \$0\)/i)).toBeInTheDocument();

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('local_only');

    fireEvent.change(select, { target: { value: 'gemini_free' } });
    expect(
      screen.getByPlaceholderText(/API key gratis de Google AI Studio/i)
    ).toBeInTheDocument();
  });
});
