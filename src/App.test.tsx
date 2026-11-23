import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { DEFAULT_SETTINGS, type Category, type Product } from './types';

const mockCategories: Category[] = [
  { id: 'tenis-new-balance', name: 'New Balance', department: 'calzado', sort_order: 10 },
  { id: 'vestidos-shein', name: 'Vestidos Shein', department: 'moda_shein', sort_order: 20 },
  { id: 'moda-hombre', name: 'Moda Hombre', department: 'hombre', sort_order: 30 },
];

const mockProducts: Product[] = [
  {
    id: 'p1',
    sku: 'YOL-003',
    title: 'New Balance 9060 Blanco & Rosa',
    brand: 'New Balance',
    department: 'calzado',
    category_id: 'tenis-new-balance',
    quality: '3A',
    currency: 'CUP',
    cost_price: 35000,
    price: 35000,
    sizes: ['36', '38'],
    fit_note: '',
    image_url: 'https://example.com/nb.webp',
    image_path: 'catalog/YOL-003.webp',
    status: 'active',
    featured: true,
    source_group: 'bombazo_calzado',
    sort_order: 10,
  },
  {
    id: 'p2',
    sku: 'YOL-122',
    title: 'Vestido Corto Satén Chocolate',
    brand: 'SHEIN',
    department: 'moda_shein',
    category_id: 'vestidos-shein',
    quality: 'SHEIN',
    currency: 'USD',
    cost_price: null,
    price: null,
    sizes: ['S', 'M'],
    fit_note: '',
    image_url: 'https://example.com/shein.webp',
    image_path: 'catalog/YOL-122.webp',
    status: 'active',
    featured: true,
    source_group: 'shein_moda',
    sort_order: 20,
  },
  {
    id: 'p3',
    sku: 'YOL-197',
    title: 'Sudadera Hoodie Café Osito Bordado',
    brand: 'SHEIN',
    department: 'hombre',
    category_id: 'moda-hombre',
    quality: 'Importado',
    currency: 'USD',
    cost_price: null,
    price: 38,
    sizes: ['M', 'L'],
    fit_note: '',
    image_url: 'https://example.com/hombre.webp',
    image_path: 'catalog/YOL-197.webp',
    status: 'active',
    featured: false,
    source_group: 'shein_moda',
    sort_order: 30,
  },
];

vi.mock('./lib/catalog', async () => {
  const actual = await vi.importActual<typeof import('./lib/catalog')>('./lib/catalog');
  return {
    ...actual,
    fetchStoreData: vi.fn(async () => ({
      settings: DEFAULT_SETTINGS,
      categories: mockCategories,
      products: mockProducts,
    })),
  };
});

describe('Yole Shop App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('carga productos, cambia moneda y completa flujo de talla y carrito', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('New Balance 9060 Blanco & Rosa')).toBeInTheDocument();
    });
    expect(screen.getByText('Vestido Corto Satén Chocolate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'USD' }));
    expect(screen.getByText('$35.71 USD')).toBeInTheDocument();

    fireEvent.click(screen.getByText('New Balance 9060 Blanco & Rosa'));
    const modal = screen.getByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: '38' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Agregar al carrito' }));
    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrito' }));
    expect(screen.getByText('Tu Pedido (1)')).toBeInTheDocument();
    expect(screen.getByText(/YOL-003 · Talla 38/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar pedido a WhatsApp' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar carrito' }));

    // Filtra Moda Shein -> muestra Mujer y Hombre juntos y permite elegir Hombre dentro
    fireEvent.click(screen.getByRole('button', { name: /Moda Shein 2/i }));
    expect(screen.getByText('Vestido Corto Satén Chocolate')).toBeInTheDocument();
    expect(screen.getByText('Sudadera Hoodie Café Osito Bordado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hombre \(1\)/i }));
    expect(screen.queryByText('Vestido Corto Satén Chocolate')).not.toBeInTheDocument();
    expect(screen.getByText('Sudadera Hoodie Café Osito Bordado')).toBeInTheDocument();
  });
});
