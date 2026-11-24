import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOrderLink,
  buildWhatsAppProductLink,
  calcYoleSheinPrice,
  cartHasSheinItems,
  formatWhatsAppOrderText,
  getDisplayPrice,
  isCupLockedFootwear,
  isSheinDepartment,
  isSheinProduct,
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

    // En modo USD por defecto, los tenis/zapatos mantienen CUP primero y todo lo demás muestra USD primero
    const shoeInUsdMode = getDisplayPrice(sampleShoe, 'USD', 920);
    expect(shoeInUsdMode.primary).toContain('CUP');
    expect(shoeInUsdMode.secondary).toContain('USD');
    expect(isCupLockedFootwear(sampleShoe)).toBe(true);

    const accUsdMode = getDisplayPrice(
      {
        price: 18,
        currency: 'USD',
        department: 'accesorios',
        category_id: 'bolsos-relojes',
      },
      'USD',
      980
    );
    expect(accUsdMode.primary).toBe('$18 USD');
    expect(accUsdMode.secondary).toContain('CUP');

    const zuecoUsdMode = getDisplayPrice(
      {
        price: 32,
        currency: 'USD',
        department: 'calzado',
        category_id: 'zuecos-sandalias',
      },
      'USD',
      980
    );
    expect(isCupLockedFootwear({ department: 'calzado', category_id: 'zuecos-sandalias' })).toBe(false);
    expect(zuecoUsdMode.primary).toBe('$32 USD');

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

  it('aplica descuento de cupón VIP y genera enlace de seguimiento QR', () => {
    const summary = summarizeCart(
      [{ product: sampleShoe, size: '38', qty: 1 }],
      DEFAULT_SETTINGS,
      'recogida',
      'efectivo',
      {
        id: 'c1',
        code: 'YOLE10',
        discount_type: 'percent',
        discount_value: 10,
        department: 'all',
        min_order_usd: 0,
        is_reseller_vip: true,
        vip_label: 'VIP 10%',
      }
    );
    expect(summary.discountCup).toBe(3500);
    expect(summary.discountedSubtotalCup).toBe(31500);
    expect(summary.totalCupWithExtras).toBe(31500);

    const oLink = buildWhatsAppOrderLink({
      orderCode: 'YOL-ORD-1042',
      customerName: 'Ana',
      customerPhone: '+5351234567',
      deliveryType: 'recogida',
      deliveryAddress: '',
      paymentMethod: 'efectivo',
      notes: '',
      items: [{ product: sampleShoe, size: '38', qty: 1 }],
      summary,
      discountCode: 'YOLE10',
      settings: DEFAULT_SETTINGS,
    });
    const decoded = decodeURIComponent(oLink);
    expect(decoded).toContain('YOLE10');
    expect(decoded).toContain('https://yoleshop.ddns.net/?track=YOL-ORD-1042');
  });

  it('bloquea recargo por transferencia cuando el carrito incluye artículos Shein (moda_shein u hombre)', () => {
    expect(isSheinDepartment('moda_shein')).toBe(true);
    expect(isSheinDepartment('hombre')).toBe(true);
    expect(isSheinDepartment('calzado')).toBe(false);
    expect(isSheinDepartment('movilidad')).toBe(false);

    const sampleHombre: Product = {
      ...sampleShein,
      id: '3',
      sku: 'YOL-197',
      department: 'hombre',
      category_id: 'moda-hombre',
      price: 40,
      currency: 'USD',
    };

    expect(cartHasSheinItems([{ product: sampleShoe, size: '38', qty: 1 }])).toBe(false);
    expect(
      cartHasSheinItems([
        { product: sampleShoe, size: '38', qty: 1 },
        { product: sampleShein, size: 'M', qty: 1 },
      ])
    ).toBe(true);
    expect(cartHasSheinItems([{ product: sampleHombre, size: 'L', qty: 1 }])).toBe(true);

    // Aunque se pase 'transferencia', summarizeCart anula el recargo si hay Shein
    const withHombre = summarizeCart(
      [{ product: sampleHombre, size: 'L', qty: 1 }],
      DEFAULT_SETTINGS,
      'recogida',
      'transferencia'
    );
    expect(withHombre.transferFeeCup).toBe(0);

    // Sin Shein, transferencia sí aplica recargo normal
    const onlyShoe = summarizeCart(
      [{ product: sampleShoe, size: '38', qty: 1 }],
      DEFAULT_SETTINGS,
      'recogida',
      'transferencia'
    );
    expect(onlyShoe.transferFeeCup).toBe(7000);

    // Zuecos y sandalias Shein dentro de departamento calzado también cuentan como Shein
    const sampleZuecoShein: Product = {
      ...sampleShoe,
      id: '4',
      sku: 'YOL-183',
      title: 'Zuecos Café Claro Doble Hebilla',
      brand: 'SHEIN',
      department: 'calzado',
      category_id: 'zuecos-sandalias',
      quality: 'Importado',
      currency: 'USD',
      cost_price: 12,
      price: 14,
      source_group: 'shein_moda',
    };
    expect(isSheinProduct(sampleZuecoShein)).toBe(true);
    expect(isSheinProduct(sampleShoe)).toBe(false);
    expect(cartHasSheinItems([{ product: sampleZuecoShein, size: '38', qty: 1 }])).toBe(true);
    const zuecoSummary = summarizeCart(
      [{ product: sampleZuecoShein, size: '38', qty: 1 }],
      DEFAULT_SETTINGS,
      'recogida',
      'transferencia'
    );
    expect(zuecoSummary.transferFeeCup).toBe(0);
  });
});
