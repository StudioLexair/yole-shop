import { useRef, useState } from 'react';
import { Eye, Film, Heart, Images, MessageCircle, ShoppingBag } from 'lucide-react';
import type { Currency, Product, StoreSettings } from '../types';
import { buildWhatsAppProductLink, getDisplayPrice, isSheinProduct } from '../lib/pricing';
import { getAvailableSizes } from '../lib/catalog';
import { SmartImage } from './SmartImage';

interface ProductCardProps {
  product: Product;
  displayCurrency: Currency;
  settings: StoreSettings;
  isFavorite?: boolean;
  onToggleFavorite?: (sku: string) => void;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product, size: string) => void;
}

export function ProductCard({
  product,
  displayCurrency,
  settings,
  isFavorite = false,
  onToggleFavorite,
  onSelect,
  onQuickAdd,
}: ProductCardProps) {
  const priceInfo = getDisplayPrice(product, displayCurrency, settings.usd_to_cup_rate);
  const soldOutSet = new Set(product.sold_out_sizes || []);
  const availableSizes = getAvailableSizes(product);
  const defaultSize = availableSizes[0] || product.sizes[0] || 'Única';
  const waUrl = buildWhatsAppProductLink(product, defaultSize, settings);
  const allSizesOut = product.sizes.length > 0 && availableSizes.length === 0;
  const isSoldOut = product.status === 'sold_out' || allSizesOut;

  const altPhoto = product.extra_images?.[0] || '';
  const totalPhotos = 1 + (product.extra_images?.length || 0);
  const [showAltOnTouch, setShowAltOnTouch] = useState(false);
  const [loadAlt, setLoadAlt] = useState(false);
  const [altReady, setAltReady] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!altPhoto) return;
    setLoadAlt(true);
    const t = e.touches[0];
    if (t) {
      swipeStartRef.current = { x: t.clientX, y: t.clientY };
      swipedRef.current = false;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!altPhoto || !swipeStartRef.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
      swipedRef.current = true;
      setShowAltOnTouch((prev) => !prev);
      setTimeout(() => {
        swipedRef.current = false;
      }, 150);
    }
  };

  return (
    <article className={`p-card${isSoldOut ? ' is-sold-out' : ''}${showAltOnTouch ? ' is-alt-active' : ''}`}>
      <div
        className="p-card__media"
        onMouseEnter={() => {
          if (altPhoto) setLoadAlt(true);
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (swipedRef.current) return;
          onSelect(product);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(product);
        }}
      >
        <SmartImage
          src={product.image_url}
          alt={product.title}
          loading="lazy"
          decoding="async"
          variant="card"
          showRetryOnError
          className="p-card__img-main"
        />
        {altPhoto && loadAlt && (
          <img
            src={altPhoto}
            alt={`${product.title} vista alternativa`}
            loading="lazy"
            decoding="async"
            onLoad={() => setAltReady(true)}
            className={`p-card__img-alt${altReady ? ' is-ready' : ''}`}
          />
        )}
        <div className="p-card__badges">
          {(product.category_id === 'zuecos-sandalias' || product.quality) && (
            <span
              className={`p-badge p-badge--qual${product.quality === 'G5' ? ' is-g5' : ''}${
                product.category_id === 'zuecos-sandalias' || isSheinProduct(product)
                  ? ' is-shein'
                  : ''
              }`}
            >
              {product.category_id === 'zuecos-sandalias' ? 'SHEIN' : product.quality}
            </span>
          )}
          {product.featured && !isSoldOut && (
            <span className="p-badge p-badge--feat">TOP</span>
          )}
          {totalPhotos > 1 && (
            <span className="p-badge p-badge--photos" title={`${totalPhotos} fotos disponibles`}>
              <Images size={11} /> {totalPhotos}
            </span>
          )}
          {Boolean(product.video_url) && (
            <span className="p-badge p-badge--video" title="Incluye video lookbook">
              <Film size={11} /> Video
            </span>
          )}
        </div>
        {isSoldOut && <span className="p-soldout-ribbon">Agotado</span>}

        {onToggleFavorite && (
          <button
            type="button"
            className={`p-card__fav${isFavorite ? ' is-fav' : ''}`}
            aria-label={isFavorite ? `Quitar ${product.title} de favoritos` : `Guardar ${product.title} en favoritos`}
            title={isFavorite ? 'En favoritos' : 'Guardar en favoritos'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(product.sku);
            }}
          >
            <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}

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
            {product.sizes.slice(0, 5).map((sz) => {
              const szOut = soldOutSet.has(sz);
              return (
                <span
                  key={sz}
                  className={`p-size-pill${szOut ? ' is-sold-out-size' : ''}`}
                  title={szOut ? `Talla ${sz} agotada` : `Talla ${sz} disponible`}
                >
                  {sz}
                </span>
              );
            })}
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
              title={availableSizes.length > 1 ? 'Elegir talla' : 'Agregar al carrito'}
              onClick={() => {
                if (availableSizes.length > 1) onSelect(product);
                else onQuickAdd(product, defaultSize);
              }}
            >
              <ShoppingBag size={15} />
              <span>{availableSizes.length > 1 ? 'Talla' : 'Agregar'}</span>
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
