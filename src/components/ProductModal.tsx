import { useState } from 'react';
import { Check, MessageCircle, ShoppingBag, X } from 'lucide-react';
import type { Currency, Product, StoreSettings } from '../types';
import { buildWhatsAppProductLink, getDisplayPrice } from '../lib/pricing';

interface ProductModalProps {
  product: Product;
  displayCurrency: Currency;
  settings: StoreSettings;
  onClose: () => void;
  onAddToCart: (product: Product, size: string) => void;
}

export function ProductModal({
  product,
  displayCurrency,
  settings,
  onClose,
  onAddToCart,
}: ProductModalProps) {
  const availableSizes = product.sizes.length > 0 ? product.sizes : ['Única'];
  const [selectedSize, setSelectedSize] = useState(availableSizes[0]);
  const [added, setAdded] = useState(false);

  const priceInfo = getDisplayPrice(product, displayCurrency, settings.usd_to_cup_rate);
  const waUrl = buildWhatsAppProductLink(product, selectedSize, settings);
  const isSoldOut = product.status === 'sold_out';

  const handleAdd = () => {
    if (isSoldOut) return;
    onAddToCart(product, selectedSize);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={product.title} onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>

        <div className="modal-grid">
          <div className="modal-media">
            <img src={product.image_url} alt={product.title} />
          </div>

          <div className="modal-info">
            <div className="modal-meta-row">
              <span className="p-badge p-badge--sku">{product.sku}</span>
              {product.quality && (
                <span className={`p-badge p-badge--qual${product.quality === 'G5' ? ' is-gold' : ''}`}>
                  Calidad {product.quality}
                </span>
              )}
              <span className="modal-brand">{product.brand}</span>
            </div>

            <h2 className="modal-title">{product.title}</h2>

            <div className="modal-price-box">
              <strong className={`modal-price${priceInfo.isConsult ? ' is-consult' : ''}`}>
                {priceInfo.primary}
              </strong>
              {priceInfo.secondary && <span className="modal-subprice">{priceInfo.secondary}</span>}
            </div>

            {product.fit_note && (
              <div className="modal-note">
                <strong>Nota:</strong> {product.fit_note}
              </div>
            )}

            <div className="modal-sizes">
              <div className="modal-sizes__label">
                <span>Selecciona talla disponible:</span>
                <strong>{selectedSize}</strong>
              </div>
              <div className="modal-sizes__grid">
                {availableSizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`size-btn${selectedSize === sz ? ' is-active' : ''}`}
                    onClick={() => setSelectedSize(sz)}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={isSoldOut}
                onClick={handleAdd}
              >
                {added ? <Check size={18} /> : <ShoppingBag size={18} />}
                <span>{isSoldOut ? 'Producto agotado' : added ? 'Agregado al carrito' : 'Agregar al carrito'}</span>
              </button>

              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--whatsapp"
              >
                <MessageCircle size={18} />
                <span>Pedir por WhatsApp</span>
              </a>
            </div>

            <p className="modal-policy">{settings.no_returns_notice}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
