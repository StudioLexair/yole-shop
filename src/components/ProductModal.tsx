import { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Maximize2,
  MessageCircle,
  Share2,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { Currency, Product, StoreSettings } from '../types';
import { buildWhatsAppProductLink, getDisplayPrice } from '../lib/pricing';
import { getAvailableSizes } from '../lib/catalog';
import { downloadRemoteImage, shareProductLink } from '../lib/mediaHelpers';

interface ProductModalProps {
  product: Product;
  displayCurrency: Currency;
  settings: StoreSettings;
  isFavorite?: boolean;
  onToggleFavorite?: (sku: string) => void;
  onClose: () => void;
  onAddToCart: (product: Product, size: string) => void;
}

export function ProductModal({
  product,
  displayCurrency,
  settings,
  isFavorite = false,
  onToggleFavorite,
  onClose,
  onAddToCart,
}: ProductModalProps) {
  const allSizes = product.sizes.length > 0 ? product.sizes : ['Única'];
  const soldOutSet = useMemo(
    () => new Set(product.sold_out_sizes || []),
    [product.sold_out_sizes]
  );
  const availableSizes = useMemo(() => getAvailableSizes(product), [product]);
  const [selectedSize, setSelectedSize] = useState(
    availableSizes[0] || allSizes[0] || 'Única'
  );
  const [added, setAdded] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const gallery = useMemo(
    () =>
      [product.image_url, ...(product.extra_images || [])].filter(
        (u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx
      ),
    [product.image_url, product.extra_images]
  );
  const [photoIdx, setPhotoIdx] = useState(0);
  const activePhoto = gallery[photoIdx] || product.image_url;

  const priceInfo = getDisplayPrice(product, displayCurrency, settings.usd_to_cup_rate);
  const waUrl = buildWhatsAppProductLink(product, selectedSize, settings);
  const noSizesAvailable = product.sizes.length > 0 && availableSizes.length === 0;
  const isSoldOut = product.status === 'sold_out' || noSizesAvailable;

  const handleAdd = () => {
    if (isSoldOut || soldOutSet.has(selectedSize)) return;
    onAddToCart(product, selectedSize);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  const handleShare = async () => {
    const res = await shareProductLink(product);
    if (res === 'copied') {
      setShareNote('Enlace copiado');
      setTimeout(() => setShareNote(''), 2000);
    } else if (res === 'shared') {
      setShareNote('Compartido');
      setTimeout(() => setShareNote(''), 1800);
    }
  };

  const handleDownloadPhoto = async () => {
    setDownloading(true);
    try {
      const suffix = photoIdx > 0 ? `-${photoIdx + 1}` : '';
      await downloadRemoteImage(activePhoto, `${product.sku}${suffix}.webp`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={product.title}
        onClick={onClose}
      >
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-sheet-handle" aria-hidden="true">
            <span />
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>

          <div className="modal-grid">
            <div className="modal-media-wrap">
              <div className="modal-media">
                <img
                  src={activePhoto}
                  alt={product.title}
                  onClick={() => setLightboxOpen(true)}
                  title="Toca para ampliar en pantalla completa"
                  style={{ cursor: 'zoom-in' }}
                />
                <button
                  type="button"
                  className="modal-zoom-btn"
                  aria-label="Ampliar foto en pantalla completa"
                  onClick={() => setLightboxOpen(true)}
                >
                  <Maximize2 size={15} />
                </button>
                {gallery.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="modal-gal-arrow is-prev"
                      aria-label="Foto anterior"
                      onClick={() =>
                        setPhotoIdx((i) => (i - 1 + gallery.length) % gallery.length)
                      }
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      className="modal-gal-arrow is-next"
                      aria-label="Siguiente foto"
                      onClick={() => setPhotoIdx((i) => (i + 1) % gallery.length)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <span className="modal-gal-count">
                      {photoIdx + 1}/{gallery.length}
                    </span>
                  </>
                )}
              </div>

              {gallery.length > 1 && (
                <div className="modal-thumbs" role="tablist" aria-label="Galería de fotos">
                  {gallery.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      className={`modal-thumb${idx === photoIdx ? ' is-active' : ''}`}
                      onClick={() => setPhotoIdx(idx)}
                      aria-label={`Ver foto ${idx + 1}`}
                    >
                      <img src={url} alt={`${product.title} vista ${idx + 1}`} />
                    </button>
                  ))}
                </div>
              )}
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
                  <span>
                    {noSizesAvailable
                      ? 'Todas las tallas agotadas temporalmente'
                      : 'Selecciona talla disponible:'}
                  </span>
                  <strong>{noSizesAvailable ? 'Agotado' : selectedSize}</strong>
                </div>
                <div className="modal-sizes__grid">
                  {allSizes.map((sz) => {
                    const isSzOut = soldOutSet.has(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        disabled={isSzOut}
                        title={isSzOut ? `Talla ${sz} agotada` : `Seleccionar talla ${sz}`}
                        className={`size-btn${selectedSize === sz && !isSzOut ? ' is-active' : ''}${
                          isSzOut ? ' is-sold-out-size' : ''
                        }`}
                        onClick={() => !isSzOut && setSelectedSize(sz)}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="modal-utility-row">
                {onToggleFavorite && (
                  <button
                    type="button"
                    className={`btn-util${isFavorite ? ' is-fav' : ''}`}
                    onClick={() => onToggleFavorite(product.sku)}
                  >
                    <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                    <span>{isFavorite ? 'En favoritos' : 'Favorito'}</span>
                  </button>
                )}
                <button type="button" className="btn-util" onClick={handleShare}>
                  <Share2 size={15} />
                  <span>{shareNote || 'Compartir'}</span>
                </button>
                <button
                  type="button"
                  className="btn-util"
                  disabled={downloading}
                  onClick={handleDownloadPhoto}
                >
                  <Download size={15} />
                  <span>{downloading ? 'Bajando...' : 'Descargar foto'}</span>
                </button>
              </div>

              <p className="modal-policy" style={{ marginBottom: 14 }}>
                {settings.no_returns_notice}
              </p>

              <div className="modal-sticky-footer">
                <div className="modal-sticky-price">
                  <strong>{priceInfo.primary}</strong>
                  {priceInfo.secondary && <small>{priceInfo.secondary}</small>}
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={isSoldOut}
                    onClick={handleAdd}
                  >
                    {added ? <Check size={18} /> : <ShoppingBag size={18} />}
                    <span>
                      {isSoldOut
                        ? 'Producto agotado'
                        : added
                          ? 'Agregado al carrito'
                          : 'Agregar al carrito'}
                    </span>
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {lightboxOpen && (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada de ${product.title}`}
          onClick={() => setLightboxOpen(false)}
        >
          <div className="lightbox-top" onClick={(e) => e.stopPropagation()}>
            <span>
              {product.sku} · {photoIdx + 1}/{gallery.length}
            </span>
            <div className="lightbox-top__btns">
              <button
                type="button"
                className="lightbox-btn"
                onClick={handleDownloadPhoto}
                aria-label="Descargar foto ampliada"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                className="lightbox-btn"
                onClick={() => setLightboxOpen(false)}
                aria-label="Cerrar vista ampliada"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
            {gallery.length > 1 && (
              <button
                type="button"
                className="lightbox-arrow is-prev"
                aria-label="Foto anterior"
                onClick={() =>
                  setPhotoIdx((i) => (i - 1 + gallery.length) % gallery.length)
                }
              >
                <ChevronLeft size={24} />
              </button>
            )}
            <img src={activePhoto} alt={product.title} />
            {gallery.length > 1 && (
              <button
                type="button"
                className="lightbox-arrow is-next"
                aria-label="Siguiente foto"
                onClick={() => setPhotoIdx((i) => (i + 1) % gallery.length)}
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
