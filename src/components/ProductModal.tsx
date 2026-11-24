import { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Film,
  Heart,
  Maximize2,
  MessageCircle,
  Scale,
  Share2,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { Currency, Product, ResellerConfig, StoreSettings } from '../types';
import {
  buildWhatsAppProductLink,
  isSheinProduct,
  isSolarProduct,
} from '../lib/pricing';
import { getAvailableSizes, submitSizeRequest } from '../lib/catalog';
import { getCrossSellSuggestions, getSimilarProducts } from '../lib/assistantEngine';
import { downloadFormalQuotePdf, getClientFacingPrice } from '../lib/commerceTools';
import { extractProductSpecs } from '../lib/specExtractor';
import { downloadRemoteImage, shareProductLink } from '../lib/mediaHelpers';
import { SmartImage } from './SmartImage';

interface ProductModalProps {
  product: Product;
  allProducts?: Product[];
  recentProducts?: Product[];
  displayCurrency: Currency;
  settings: StoreSettings;
  reseller?: ResellerConfig;
  isFavorite?: boolean;
  onToggleFavorite?: (sku: string) => void;
  onClose: () => void;
  onAddToCart: (product: Product, size: string) => void;
  onWhatsAppClick?: (product: Product) => void;
  onSelectProduct?: (product: Product) => void;
  onCompareProduct?: (product: Product) => void;
}

type MediaSlide = { type: 'image' | 'video'; url: string };

export function ProductModal({
  product,
  allProducts = [],
  recentProducts = [],
  displayCurrency,
  settings,
  reseller,
  isFavorite = false,
  onToggleFavorite,
  onClose,
  onAddToCart,
  onWhatsAppClick,
  onSelectProduct,
  onCompareProduct,
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

  // Solicitud "Encarga tu talla o modelo"
  const [reqOpen, setReqOpen] = useState(false);
  const [reqSize, setReqSize] = useState(allSizes.find((s) => soldOutSet.has(s)) || '');
  const [reqName, setReqName] = useState('');
  const [reqPhone, setReqPhone] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqSaving, setReqSaving] = useState(false);
  const [reqSent, setReqSent] = useState(false);
  const [reqErr, setReqErr] = useState('');

  const mediaSlides = useMemo<MediaSlide[]>(() => {
    const imgs = [product.image_url, ...(product.extra_images || [])].filter(
      (u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx
    );
    const list: MediaSlide[] = imgs.map((url) => ({ type: 'image', url }));
    if (product.video_url && product.video_url.trim()) {
      list.push({ type: 'video', url: product.video_url.trim() });
    }
    return list;
  }, [product.image_url, product.extra_images, product.video_url]);

  const [photoIdx, setPhotoIdx] = useState(0);
  const [quoteBusy, setQuoteBusy] = useState(false);

  useEffect(() => {
    setPhotoIdx(0);
    setSelectedSize(availableSizes[0] || allSizes[0] || 'Única');
    setReqOpen(false);
    setReqSent(false);
  }, [product.id]);

  const activeSlide = mediaSlides[photoIdx] || { type: 'image' as const, url: product.image_url };

  const priceInfo = getClientFacingPrice(
    product,
    displayCurrency,
    settings.usd_to_cup_rate,
    reseller
  );
  const extractedSpecs = useMemo(() => extractProductSpecs(product), [product]);
  const crossSell = useMemo(
    () => (allProducts.length > 0 ? getCrossSellSuggestions(product, allProducts) : []),
    [product, allProducts]
  );
  const similarItems = useMemo(
    () => (allProducts.length > 0 ? getSimilarProducts(product, allProducts) : []),
    [product, allProducts]
  );
  const recentOthers = useMemo(
    () => recentProducts.filter((p) => p.id !== product.id).slice(0, 6),
    [recentProducts, product.id]
  );

  const waUrl = buildWhatsAppProductLink(product, selectedSize, settings);
  const noSizesAvailable = product.sizes.length > 0 && availableSizes.length === 0;
  const isSoldOut = product.status === 'sold_out' || noSizesAvailable;

  const handleDownloadQuote = async () => {
    if (quoteBusy) return;
    setQuoteBusy(true);
    try {
      await downloadFormalQuotePdf({
        items: [{ product, size: selectedSize, qty: 1 }],
        settings,
        reseller,
      });
    } finally {
      setQuoteBusy(false);
    }
  };

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
      const targetUrl = activeSlide.type === 'image' ? activeSlide.url : product.image_url;
      const suffix = photoIdx > 0 ? `-${photoIdx + 1}` : '';
      await downloadRemoteImage(targetUrl, `${product.sku}${suffix}.webp`);
    } finally {
      setDownloading(false);
    }
  };

  const handleSizeRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqErr('');
    if (!reqSize.trim()) {
      setReqErr('Indica la talla o variante que necesitas.');
      return;
    }
    if (reqPhone.trim().length < 6) {
      setReqErr('Escribe tu número de WhatsApp para avisarte.');
      return;
    }
    setReqSaving(true);
    try {
      await submitSizeRequest({
        sku: product.sku,
        product_title: product.title,
        requested_size: reqSize.trim(),
        customer_name: reqName.trim(),
        customer_whatsapp: reqPhone.trim(),
        note: reqNote.trim(),
      });
      setReqSent(true);
      setReqNote('');
    } catch {
      setReqErr('No pudimos guardar la solicitud ahora. Intenta nuevamente.');
    } finally {
      setReqSaving(false);
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
                {activeSlide.type === 'video' ? (
                  <video
                    src={activeSlide.url}
                    controls
                    playsInline
                    loop
                    muted
                    autoPlay
                    className="modal-video-player"
                  />
                ) : (
                  <>
                    <SmartImage
                      src={activeSlide.url}
                      alt={product.title}
                      loading="eager"
                      fetchPriority="high"
                      variant="card"
                      showRetryOnError
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
                  </>
                )}
                {mediaSlides.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="modal-gal-arrow is-prev"
                      aria-label="Foto anterior"
                      onClick={() =>
                        setPhotoIdx((i) => (i - 1 + mediaSlides.length) % mediaSlides.length)
                      }
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      className="modal-gal-arrow is-next"
                      aria-label="Siguiente foto"
                      onClick={() => setPhotoIdx((i) => (i + 1) % mediaSlides.length)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <span className="modal-gal-count">
                      {photoIdx + 1}/{mediaSlides.length}
                    </span>
                  </>
                )}
              </div>

              {mediaSlides.length > 1 && (
                <div className="modal-thumbs" role="tablist" aria-label="Galería multimedia">
                  {mediaSlides.map((slide, idx) => (
                    <button
                      key={`${slide.type}-${slide.url}-${idx}`}
                      type="button"
                      className={`modal-thumb${idx === photoIdx ? ' is-active' : ''}`}
                      onClick={() => setPhotoIdx(idx)}
                      aria-label={slide.type === 'video' ? 'Ver video lookbook' : `Ver foto ${idx + 1}`}
                    >
                      {slide.type === 'video' ? (
                        <span className="modal-thumb__video">
                          <Film size={16} />
                        </span>
                      ) : (
                        <SmartImage
                          src={slide.url}
                          alt={`${product.title} vista ${idx + 1}`}
                          variant="compact"
                        />
                      )}
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
                <strong className={`modal-price${priceInfo.amount === null ? ' is-consult' : ''}`}>
                  {priceInfo.formatted}
                </strong>
                {priceInfo.secondaryFormatted && (
                  <span className="modal-subprice">{priceInfo.secondaryFormatted}</span>
                )}
              </div>

              {(product.department === 'movilidad' || product.department === 'solares') &&
                extractedSpecs.rows.length > 0 && (
                  <div className="modal-spec-grid" aria-label="Ficha técnica estructurada">
                    {extractedSpecs.rows.map((row) => (
                      <div key={row.label} className="modal-spec-cell">
                        <small>{row.label}</small>
                        <strong>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                )}

              {(isSheinProduct(product) || isSolarProduct(product)) && (
                <div className="shein-cash-only-note" role="note">
                  {isSolarProduct(product)
                    ? 'Solo pago en Efectivo CUP o USD (Equipos Solares no admiten transferencia).'
                    : 'Solo pago en Efectivo CUP o USD (artículos Shein no admiten transferencia).'}
                </div>
              )}

              {product.fit_note && (
                <div className="modal-note">
                  <strong>Especificaciones / Nota:</strong> {product.fit_note}
                </div>
              )}

              <div className="modal-sizes">
                <div className="modal-sizes__label">
                  <span>
                    {noSizesAvailable
                      ? 'Agotado temporalmente'
                      : product.department === 'movilidad' || product.department === 'solares'
                        ? 'Disponibilidad / Opción:'
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

                <button
                  type="button"
                  className="size-request-trigger"
                  onClick={() => {
                    setReqOpen((prev) => !prev);
                    setReqSent(false);
                  }}
                >
                  <BellRing size={14} />
                  <span>¿No está tu talla o está agotado? Encárganosla</span>
                </button>
              </div>

              {reqOpen && (
                <form className="size-request-box" onSubmit={handleSizeRequestSubmit}>
                  {reqSent ? (
                    <p className="form-ok">
                      ¡Solicitud recibida! Te avisaremos por WhatsApp en cuanto entre talla{' '}
                      <strong>{reqSize}</strong>.
                    </p>
                  ) : (
                    <>
                      <div className="size-request-grid">
                        <input
                          type="text"
                          required
                          placeholder="Talla deseada (ej. 42, M)"
                          value={reqSize}
                          onChange={(e) => setReqSize(e.target.value)}
                        />
                        <input
                          type="tel"
                          required
                          placeholder="Tu WhatsApp *"
                          value={reqPhone}
                          onChange={(e) => setReqPhone(e.target.value)}
                        />
                      </div>
                      <div className="size-request-grid">
                        <input
                          type="text"
                          placeholder="Tu nombre (opcional)"
                          value={reqName}
                          onChange={(e) => setReqName(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Nota / color (opcional)"
                          value={reqNote}
                          onChange={(e) => setReqNote(e.target.value)}
                        />
                      </div>
                      {reqErr && <p className="form-error">{reqErr}</p>}
                      <button
                        type="submit"
                        className="btn btn--primary btn--sm"
                        disabled={reqSaving}
                      >
                        {reqSaving ? 'Enviando solicitud...' : 'Enviar solicitud de talla'}
                      </button>
                    </>
                  )}
                </form>
              )}

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
                  onClick={handleDownloadPhoto}
                  disabled={downloading}
                >
                  <Download size={15} />
                  <span>{downloading ? 'Descargando...' : 'Descargar foto'}</span>
                </button>
                <button
                  type="button"
                  className="btn-util"
                  onClick={handleDownloadQuote}
                  disabled={quoteBusy}
                >
                  <FileDown size={15} />
                  <span>{quoteBusy ? 'Generando...' : 'Cotización PDF'}</span>
                </button>
                {onCompareProduct &&
                  (product.department === 'movilidad' || product.department === 'solares') && (
                    <button
                      type="button"
                      className="btn-util"
                      onClick={() => onCompareProduct(product)}
                    >
                      <Scale size={15} />
                      <span>Comparar</span>
                    </button>
                  )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--modal"
                  disabled={isSoldOut}
                  onClick={handleAdd}
                >
                  {added ? <Check size={16} /> : <ShoppingBag size={16} />}
                  <span>{added ? '¡Agregado!' : 'Agregar al carrito'}</span>
                </button>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--whatsapp btn--modal"
                  onClick={() => onWhatsAppClick?.(product)}
                >
                  <MessageCircle size={16} />
                  <span>Preguntar por WhatsApp</span>
                </a>
              </div>

              <p className="modal-disclaimer">{settings.no_returns_notice}</p>

              {(crossSell.length > 0 || similarItems.length > 0 || recentOthers.length > 0) &&
                onSelectProduct && (
                  <div className="modal-discovery-strips">
                    {crossSell.length > 0 && (
                      <div className="modal-mini-strip">
                        <h4>Completa tu compra</h4>
                        <div className="modal-mini-row">
                          {crossSell.map((rel) => {
                            const rp = getClientFacingPrice(
                              rel,
                              displayCurrency,
                              settings.usd_to_cup_rate,
                              reseller
                            );
                            return (
                              <button
                                key={rel.id}
                                type="button"
                                className="modal-mini-card"
                                onClick={() => onSelectProduct(rel)}
                              >
                                <SmartImage src={rel.image_url} alt={rel.title} variant="compact" />
                                <strong>{rel.title}</strong>
                                <span>{rp.formatted}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {similarItems.length > 0 && (
                      <div className="modal-mini-strip">
                        <h4>{isSoldOut ? 'Alternativas con stock disponible' : 'Modelos similares'}</h4>
                        <div className="modal-mini-row">
                          {similarItems.map((rel) => {
                            const rp = getClientFacingPrice(
                              rel,
                              displayCurrency,
                              settings.usd_to_cup_rate,
                              reseller
                            );
                            return (
                              <button
                                key={rel.id}
                                type="button"
                                className="modal-mini-card"
                                onClick={() => onSelectProduct(rel)}
                              >
                                <SmartImage src={rel.image_url} alt={rel.title} variant="compact" />
                                <strong>{rel.title}</strong>
                                <span>{rp.formatted}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {recentOthers.length > 0 && (
                      <div className="modal-mini-strip">
                        <h4>Vistos recientemente</h4>
                        <div className="modal-mini-row">
                          {recentOthers.map((rel) => {
                            const rp = getClientFacingPrice(
                              rel,
                              displayCurrency,
                              settings.usd_to_cup_rate,
                              reseller
                            );
                            return (
                              <button
                                key={rel.id}
                                type="button"
                                className="modal-mini-card"
                                onClick={() => onSelectProduct(rel)}
                              >
                                <SmartImage src={rel.image_url} alt={rel.title} variant="compact" />
                                <strong>{rel.title}</strong>
                                <span>{rp.formatted}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {lightboxOpen && activeSlide.type === 'image' && (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada de ${product.title}`}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setLightboxOpen(false)}
            aria-label="Cerrar vista ampliada"
          >
            <X size={24} />
          </button>

          {mediaSlides.filter((s) => s.type === 'image').length > 1 && (
            <>
              <button
                type="button"
                className="lightbox-arrow is-prev"
                aria-label="Foto anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoIdx((i) => (i - 1 + mediaSlides.length) % mediaSlides.length);
                }}
              >
                <ChevronLeft size={26} />
              </button>
              <button
                type="button"
                className="lightbox-arrow is-next"
                aria-label="Siguiente foto"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoIdx((i) => (i + 1) % mediaSlides.length);
                }}
              >
                <ChevronRight size={26} />
              </button>
            </>
          )}

          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={activeSlide.url} alt={product.title} className="lightbox-img" />
            <div className="lightbox-caption">
              <strong>{product.title}</strong>
              <span>
                {!(reseller?.enabled && reseller.hideYoleSku) ? `${product.sku} · ` : ''}
                {priceInfo.formatted}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
