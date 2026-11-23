import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOrderLink,
  buildWhatsAppProductLink,
  calcYoleSheinPrice,
  formatWhatsAppOrderText,
  getDisplayPrice,
  normalizeWhatsAppDigits,
  summarizeCart,
} from './pricing';
import { DEFAULT_SETTINGS, type Product } from '../types';

const sampleShoe: Product = {
  id: '1',
  sku: 'YOL-003',
  title: 'New Balance 9060 Blanco & Rosa',
  brand: 'New Balance',
  department: 'calzado',
  category_id: 'tenis-new-balance',
  quality: '3A',
  currency: 'CUP',
  cost_price: 35000,
  price: 35000,
  sizes: ['36', '37', '38'],
  fit_note: '',
  image_url: 'https://example.com/1.webp',
  image_path: 'catalog/YOL-003.webp',
  status: 'active',
  featured: true,
  source_group: 'bombazo_calzado',
  sort_order: 10,
};

const sampleShein: Product = {
  ...sampleShoe,
  id: '2',
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
};

describe('calcYoleSheinPrice', () => {
  it('aplica +2 USD para artículos menores a 20 USD', () => {
    expect(calcYoleSheinPrice(12)).toBe(14);
    expect(calcYoleSheinPrice(18)).toBe(20);
    expect(calcYoleSheinPrice(19)).toBe(21);
  });

  it('aplica +2 USD si el costo es 20 USD o más y par (ej. 28 -> 30)', () => {
    expect(calcYoleSheinPrice(20)).toBe(22);
    expect(calcYoleSheinPrice(28)).toBe(30);
    expect(calcYoleSheinPrice(34)).toBe(36);
  });

  it('aplica +3 USD si el costo es 20 USD o más e impar (ej. 25 -> 28)', () => {
    expect(calcYoleSheinPrice(21)).toBe(24);
    expect(calcYoleSheinPrice(25)).toBe(28);
    expect(calcYoleSheinPrice(29)).toBe(32);
  });
});

describe('pricing & WhatsApp helpers', () => {
  it('normaliza teléfonos cubanos correctamente', () => {
    expect(normalizeWhatsAppDigits('52678747')).toBe('5352678747');
    expect(normalizeWhatsAppDigits('+53 5267-8747')).toBe('5352678747');
  });

  it('muestra precio CUP y equivalente USD o Consultar precio', () => {
    const shoePrice = getDisplayPrice(sampleShoe, 'CUP', 920);
    expect(shoePrice.isConsult).toBe(false);
    expect(shoePrice.primary).toContain('35');

    const sheinPrice = getDisplayPrice(sampleShein, 'USD', 920);
    expect(sheinPrice.isConsult).toBe(true);
    expect(sheinPrice.primary).toBe('Consultar precio');
  });

  it('calcula resumen mixto del carrito y construye enlaces directos con emojis intactos', () => {
    const summary = summarizeCart(
      [
        { product: sampleShoe, size: '38', qty: 1 },
        { product: sampleShein, size: 'M', qty: 1 },
      ],
      DEFAULT_SETTINGS,
      'domicilio',
      'efectivo'
    );
    expect(summary.totalUnits).toBe(2);
    expect(summary.subtotalCup).toBe(35000);
    expect(summary.deliveryFeeCup).toBe(300);
    expect(summary.totalCupWithExtras).toBe(35300);
    expect(summary.hasUnpricedItems).toBe(true);

    const pLink = buildWhatsAppProductLink(sampleShoe, '38', DEFAULT_SETTINGS);
    expect(pLink.startsWith('https://api.whatsapp.com/send/?phone=5352678747&text=')).toBe(true);
    expect(pLink).not.toContain('%EF%BF%BD');
    expect(decodeURIComponent(pLink)).toContain('✨YoleShop✨');
    expect(decodeURIComponent(pLink)).toContain('📸 Foto: https://example.com/1.webp');

    const oLink = buildWhatsAppOrderLink({
      orderCode: 'YOL-TEST',
      customerName: 'Laura',
      customerPhone: '+5351234567',
      deliveryType: 'domicilio',
      deliveryAddress: 'Calle 7ma',
      paymentMethod: 'efectivo',
      deliveryTime: '3pm',
      notes: '',
      items: [{ product: sampleShoe, size: '38', qty: 1 }],
      summary,
      settings: DEFAULT_SETTINGS,
    });
    expect(oLink.startsWith('https://api.whatsapp.com/send/?phone=5352678747&text=')).toBe(true);
    expect(oLink).not.toContain('%EF%BF%BD');
    const decodedOrder = decodeURIComponent(oLink);
    expect(decodedOrder).toContain('✨YoleShop✨');
    expect(decodedOrder).toContain('📸 Foto: https://example.com/1.webp');
    expect(decodedOrder).toContain('💵 Precio del producto:');
    expect(decodedOrder).toContain('YOL-003');
    expect(decodedOrder).toContain('moneda nacional 35000');
    expect(decodedOrder).toContain('📍 Dirección: Calle 7ma');
    expect(decodedOrder).toContain('👤 Nombre del cliente: Laura');
    expect(decodedOrder).toContain('🕒 Hora de la entrega: 3pm');
    expect(decodedOrder).not.toContain('Gestor');

    const supplierText = formatWhatsAppOrderText({
      orderCode: 'YOL-TEST',
      customerName: 'Laura',
      customerPhone: '+5351234567',
      deliveryType: 'domicilio',
      deliveryAddress: 'Calle 7ma',
      paymentMethod: 'efectivo',
      notes: '',
      items: [
        {
          sku: 'YOL-003',
          title: 'New Balance 9060 Blanco & Rosa',
          size: '38',
          qty: 1,
          currency: 'CUP',
          unit_price: 35000,
        },
      ],
      summary,
      settings: DEFAULT_SETTINGS,
      includeManager: true,
    });
    expect(supplierText).toContain('🙋🏼‍♀️Gestor: yolexsis');
  });
});
