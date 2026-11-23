import { Eye, MessageCircle, ShoppingBag } from 'lucide-react';
import type { Currency, Product, StoreSettings } from '../types';
import { buildWhatsAppProductLink, getDisplayPrice } from '../lib/pricing';

interface ProductCardProps {
  product: Product;
  displayCurrency: Currency;
  settings: StoreSettings;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
}

export function ProductCard({
  product,
  displayCurrency,
  settings,
  onSelect,
  onQuickAdd,
}: ProductCardProps) {
  const priceInfo = getDisplayPrice(product, displayCurrency, settings.usd_to_cup_rate);
  const defaultSize = product.sizes[0] || 'Única';
  const waUrl = buildWhatsAppProductLink(product, defaultSize, settings);
  const isSoldOut = product.status === 'sold_out';

  return (
    <article className={`p-card${isSoldOut ? ' is-sold-out' : ''}`}>
      <div
        className="p-card__media"
        onClick={() => onSelect(product)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(product);
        }}
      >
        <img
          src={product.image_url}
          alt={product.title}
          loading="lazy"
          decoding="async"
        />
        <div className="p-card__badges">
          {product.quality && (
            <span className={`p-badge p-badge--qual${product.quality === 'G5' ? ' is-g5' : ''}`}>
              {product.quality}
            </span>
          )}
          {product.featured && !isSoldOut && (
            <span className="p-badge p-badge--feat">TOP</span>
          )}
        </div>
        {isSoldOut && <span className="p-soldout-ribbon">Agotado</span>}
        <button
          type="button"
          className="p-card__zoom"
          aria-label={`Ver detalles de ${product.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(product);
          }}
        >
          <Eye size={15} />
        </button>
      </div>

      <div className="p-card__body">
        <div className="p-card__meta-line">
          <span className="p-card__brand">{product.brand}</span>
          <span className="p-card__sku">{product.sku}</span>
        </div>

        <h3 className="p-card__title" onClick={() => onSelect(product)}>
          {product.title}
        </h3>

        {product.sizes.length > 0 && (
          <div className="p-card__sizes" aria-label="Tallas disponibles">
            {product.sizes.slice(0, 5).map((sz) => (
              <span key={sz} className="p-size-pill">
                {sz}
              </span>
            ))}
            {product.sizes.length > 5 && (
              <span className="p-size-pill p-size-pill--more">
                +{product.sizes.length - 5}
              </span>
            )}
          </div>
        )}

        {product.fit_note && <p className="p-card__note">{product.fit_note}</p>}

        <div className="p-card__footer">
          <div className="p-card__price-wrap">
            <strong className={`p-card__price${priceInfo.isConsult ? ' is-consult' : ''}`}>
              {priceInfo.primary}
            </strong>
            {priceInfo.secondary && (
              <span className="p-card__subprice">{priceInfo.secondary}</span>
            )}
          </div>

          <div className="p-card__actions">
            <button
              type="button"
              className="btn-icon-add"
              disabled={isSoldOut}
              title={product.sizes.length > 1 ? 'Elegir talla' : 'Agregar al carrito'}
              onClick={() => {
                if (product.sizes.length > 1) onSelect(product);
                else onQuickAdd(product, defaultSize);
              }}
            >
              <ShoppingBag size={15} />
              <span>{product.sizes.length > 1 ? 'Talla' : 'Agregar'}</span>
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon-wa"
              aria-label={`Consultar ${product.title} por WhatsApp`}
              title="Pedir por WhatsApp"
            >
              <MessageCircle size={15} />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
