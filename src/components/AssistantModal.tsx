import React, { useMemo, useState } from 'react';
import {
  Bot,
  Calculator,
  FileDown,
  GitCompare,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type { Category, Currency, Product, ResellerConfig, StoreSettings } from '../types';
import {
  askYoleAssistant,
  buildComparisonMatrix,
  buildMobilityKitOptions,
  buildSolarKitOptions,
  calculateSolarSizing,
  SOLAR_APPLIANCES,
  type AssistantResponse,
  type MobilityFrameType,
  type SolarSelectionItem,
} from '../lib/assistantEngine';
import { filterProductsWithMeta } from '../lib/catalog';
import { buildSearchLexicon } from '../lib/smartSearch';
import { getClientFacingPrice, downloadFormalQuotePdf } from '../lib/commerceTools';
import { priceInUsd } from '../lib/pricing';
import { SmartImage } from './SmartImage';

export type AssistantTabKey = 'chat' | 'solar' | 'compare' | 'kit';

interface AssistantModalProps {
  open: boolean;
  initialTab: AssistantTabKey;
  products: Product[];
  categories: Category[];
  settings: StoreSettings;
  displayCurrency: Currency;
  reseller?: ResellerConfig;
  compareIds: string[];
  onToggleCompare: (productId: string) => void;
  onClearCompare: () => void;
  onOpenProduct: (product: Product) => void;
  onAddToCart: (product: Product, size: string) => void;
  onClose: () => void;
}

interface ChatTurn {
  id: string;
  question: string;
  response: AssistantResponse;
}

export function AssistantModal({
  open,
  initialTab,
  products,
  categories,
  settings,
  displayCurrency,
  reseller,
  compareIds,
  onToggleCompare,
  onClearCompare,
  onOpenProduct,
  onAddToCart,
  onClose,
}: AssistantModalProps) {
  const [activeTab, setActiveTab] = useState<AssistantTabKey>(initialTab);
  const lexicon = useMemo(() => buildSearchLexicon(products, categories), [products, categories]);

  // Sync tab when opened with a specific intent
  React.useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  // --- TAB 1: CONVERSATIONAL AI ASSISTANT ---
  const [promptInput, setPromptInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  const handleAsk = (text?: string) => {
    const q = (text ?? promptInput).trim();
    if (!q) return;
    const response = askYoleAssistant(q, products, categories, settings, lexicon);
    setTurns((prev) => [...prev, { id: String(Date.now()), question: q, response }]);
    if (!text) setPromptInput('');
  };

  // --- TAB 2: SOLAR CALCULATOR ---
  const [solarSelections, setSolarSelections] = useState<Record<string, number>>({
    refri: 1,
    ventilador: 2,
    tv: 1,
    wifi: 1,
    luces: 1,
  });
  const [blackoutHours, setBlackoutHours] = useState(8);

  const solarResult = useMemo(() => {
    const items: SolarSelectionItem[] = Object.entries(solarSelections)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, qty }));
    return calculateSolarSizing(items, blackoutHours, products, settings.usd_to_cup_rate);
  }, [solarSelections, blackoutHours, products, settings.usd_to_cup_rate]);

  const adjustAppliance = (id: string, delta: number) => {
    setSolarSelections((prev) => {
      const nextQty = Math.max(0, Math.min(8, (prev[id] || 0) + delta));
      return { ...prev, [id]: nextQty };
    });
  };

  // --- TAB 3: COMPARE ---
  const [compareSearch, setCompareSearch] = useState('');
  const compareProducts = useMemo(
    () =>
      compareIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p)),
    [compareIds, products]
  );

  const matrix = useMemo(
    () => buildComparisonMatrix(compareProducts, settings),
    [compareProducts, settings]
  );

  const comparePickPool = useMemo(() => {
    if (!compareSearch.trim()) {
      return products
        .filter(
          (p) =>
            p.status === 'active' &&
            (p.department === 'movilidad' || p.department === 'solares') &&
            !compareIds.includes(p.id)
        )
        .slice(0, 8);
    }
    return filterProductsWithMeta(
      products,
      {
        department: 'all',
        categoryId: 'all',
        size: 'all',
        search: compareSearch,
        onlyPriced: false,
        includeSoldOut: false,
        sort: 'featured',
      },
      settings.usd_to_cup_rate,
      categories,
      lexicon
    )
      .products.filter((p) => !compareIds.includes(p.id))
      .slice(0, 8);
  }, [compareSearch, products, compareIds, settings.usd_to_cup_rate, categories, lexicon]);

  // --- TAB 4: KIT BUILDER (REMOTORIZACIÓN & KIT SOLAR) ---
  const [kitMode, setKitMode] = useState<'mobility' | 'solar'>('mobility');
  const [frameType, setFrameType] = useState<MobilityFrameType>('suzuki_criollo');
  const [selectedMobPrimaryId, setSelectedMobPrimaryId] = useState<string>('');
  const [selectedMobAccId, setSelectedMobAccId] = useState<string>('');

  const mobOptions = useMemo(
    () => buildMobilityKitOptions(frameType, products),
    [frameType, products]
  );
  const solarKitOptions = useMemo(() => buildSolarKitOptions(products), [products]);

  const [selectedInvId, setSelectedInvId] = useState<string>('');
  const [selectedBatId, setSelectedBatId] = useState<string>('');
  const [selectedPanelId, setSelectedPanelId] = useState<string>('');

  // Auto-pick defaults for kits when empty
  React.useEffect(() => {
    if (mobOptions.primaryItems.length > 0 && !mobOptions.primaryItems.some((p) => p.id === selectedMobPrimaryId)) {
      setSelectedMobPrimaryId(mobOptions.primaryItems[0].id);
    }
    if (mobOptions.accessoryItems.length > 0 && !mobOptions.accessoryItems.some((p) => p.id === selectedMobAccId)) {
      setSelectedMobAccId(frameType === 'triciclo' ? mobOptions.accessoryItems[0].id : '');
    }
  }, [mobOptions, frameType, selectedMobPrimaryId, selectedMobAccId]);

  React.useEffect(() => {
    if (!selectedInvId && solarKitOptions.inverters[0]) setSelectedInvId(solarKitOptions.inverters[0].id);
    if (!selectedBatId && solarKitOptions.batteries[0]) setSelectedBatId(solarKitOptions.batteries[0].id);
    if (!selectedPanelId && solarKitOptions.panels[0]) setSelectedPanelId(solarKitOptions.panels[0].id);
  }, [solarKitOptions, selectedInvId, selectedBatId, selectedPanelId]);

  const activeKitProducts = useMemo(() => {
    if (kitMode === 'mobility') {
      return [
        mobOptions.primaryItems.find((p) => p.id === selectedMobPrimaryId),
        mobOptions.accessoryItems.find((p) => p.id === selectedMobAccId),
      ].filter((p): p is Product => Boolean(p));
    }
    return [
      solarKitOptions.inverters.find((p) => p.id === selectedInvId),
      solarKitOptions.batteries.find((p) => p.id === selectedBatId),
      solarKitOptions.panels.find((p) => p.id === selectedPanelId),
    ].filter((p): p is Product => Boolean(p));
  }, [
    kitMode,
    mobOptions,
    selectedMobPrimaryId,
    selectedMobAccId,
    solarKitOptions,
    selectedInvId,
    selectedBatId,
    selectedPanelId,
  ]);

  const kitTotalUsd = useMemo(
    () =>
      activeKitProducts.reduce((sum, p) => {
        const u = priceInUsd(p.price, p.currency, settings.usd_to_cup_rate);
        return sum + (u || 0);
      }, 0),
    [activeKitProducts, settings.usd_to_cup_rate]
  );

  const [quoteBusy, setQuoteBusy] = useState(false);

  if (!open) return null;

  const handleDownloadItemsPdf = async (items: Product[]) => {
    if (items.length === 0 || quoteBusy) return;
    setQuoteBusy(true);
    try {
      await downloadFormalQuotePdf({
        items: items.map((p) => ({
          product: p,
          size: p.sizes[0] || 'Única',
          qty: 1,
        })),
        settings,
        reseller,
      });
    } finally {
      setQuoteBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop assistant-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Asistente Yole Pro"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="assistant-sheet">
        <div className="assistant-header">
          <div className="assistant-header__brand">
            <span className="assistant-header__badge">
              <Sparkles size={16} />
            </span>
            <div>
              <strong>Asistente Yole Pro</strong>
              <p>Compara modelos, calcula tu planta solar o arma tu kit</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar asistente"
          >
            <X size={18} />
          </button>
        </div>

        <div className="assistant-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chat'}
            className={`assistant-tab ${activeTab === 'chat' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <Bot size={15} />
            <span>Asistente</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'solar'}
            className={`assistant-tab ${activeTab === 'solar' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('solar')}
          >
            <Calculator size={15} />
            <span>Calc. Solar</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'compare'}
            className={`assistant-tab ${activeTab === 'compare' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('compare')}
          >
            <GitCompare size={15} />
            <span>Comparar{compareProducts.length > 0 ? ` (${compareProducts.length})` : ''}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'kit'}
            className={`assistant-tab ${activeTab === 'kit' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('kit')}
          >
            <Wrench size={15} />
            <span>Arma tu Kit</span>
          </button>
        </div>

        <div className="assistant-body">
          {/* ================= TAB 1: CONVERSATIONAL AI ASSISTANT ================= */}
          {activeTab === 'chat' && (
            <div className="assistant-chat">
              {turns.length === 0 && (
                <div className="assistant-welcome">
                  <p className="assistant-welcome__title">
                    Dime lo que necesitas como si hablaras con un asesor:
                  </p>
                  <div className="assistant-suggestions">
                    {[
                      'Compara TopMaq TANK vs Bucatti 2026',
                      '¿Qué planta necesito para refri, split y 2 ventiladores 8 horas?',
                      'Remotorizar cuadro Suzuki con factura',
                      'Compara EcoFlow Delta 2 vs Delta 3',
                      'Arma un kit solar con inversor y batería',
                      'Motos de gasolina con chapa menos de $2500',
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="assistant-prompt-chip"
                        onClick={() => handleAsk(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((turn) => (
                <div key={turn.id} className="assistant-turn">
                  <div className="assistant-bubble assistant-bubble--user">{turn.question}</div>
                  <div className="assistant-bubble assistant-bubble--bot">
                    <strong>{turn.response.headline}</strong>
                    <p>{turn.response.summary}</p>

                    {turn.response.mode === 'compare' && (
                      <div className="assistant-inline-compare">
                        {turn.response.matrix.rows.slice(0, 6).map((row) => (
                          <div key={row.key} className="compare-attr-card">
                            <span className="compare-attr-card__label">{row.label}</span>
                            <div className="compare-attr-card__vals">
                              {turn.response.mode === 'compare' &&
                                turn.response.matrix.products.map((prod, idx) => (
                                  <div
                                    key={prod.id}
                                    className={`compare-val-cell ${
                                      row.winnerIndices.includes(idx) ? 'is-winner' : ''
                                    }`}
                                  >
                                    <small>{prod.title.slice(0, 26)}</small>
                                    <span>{row.values[idx]}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {turn.response.mode === 'solar' && (
                      <div className="assistant-solar-recs">
                        {turn.response.sizing.recommendations.map((rec) => {
                          const pr = getClientFacingPrice(
                            rec.product,
                            displayCurrency,
                            settings.usd_to_cup_rate,
                            reseller
                          );
                          return (
                            <div key={rec.product.id} className="assistant-mini-card">
                              <SmartImage
                                src={rec.product.image_url}
                                alt={rec.product.title}
                                className="assistant-mini-card__img"
                              />
                              <div className="assistant-mini-card__info">
                                <span className={`spec-pill spec-pill--${rec.fitTone}`}>
                                  {rec.fitLabel}
                                </span>
                                <strong>{rec.product.title}</strong>
                                <span className="assistant-mini-card__price">
                                  {pr.formatted}
                                  {rec.estimatedHours ? ` · ~${rec.estimatedHours}h reales` : ''}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn-ghost-sm"
                                onClick={() => onOpenProduct(rec.product)}
                              >
                                Ver
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(turn.response.mode === 'search' || turn.response.mode === 'kit') &&
                      (turn.response.mode === 'search'
                        ? turn.response.products
                        : turn.response.items
                      ).length > 0 && (
                        <div className="assistant-solar-recs">
                          {(turn.response.mode === 'search'
                            ? turn.response.products
                            : turn.response.items
                          )
                            .slice(0, 5)
                            .map((p) => {
                              const pr = getClientFacingPrice(
                                p,
                                displayCurrency,
                                settings.usd_to_cup_rate,
                                reseller
                              );
                              return (
                                <div key={p.id} className="assistant-mini-card">
                                  <SmartImage
                                    src={p.image_url}
                                    alt={p.title}
                                    className="assistant-mini-card__img"
                                  />
                                  <div className="assistant-mini-card__info">
                                    <strong>{p.title}</strong>
                                    <span className="assistant-mini-card__price">
                                      {pr.formatted} · {p.sku}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn-ghost-sm"
                                    onClick={() => onOpenProduct(p)}
                                  >
                                    Abrir
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      )}

                    <div className="assistant-quick-replies">
                      {turn.response.quickReplies.map((qr) => (
                        <button
                          key={qr}
                          type="button"
                          className="quick-chip"
                          onClick={() => handleAsk(qr)}
                        >
                          {qr}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <form
                className="assistant-input-bar"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAsk();
                }}
              >
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Ej: Compara Unizuki vs TopMaq o Planta para refri..."
                  aria-label="Preguntar al Asistente Yole Pro"
                />
                <button type="submit" className="btn-primary-sm" aria-label="Enviar consulta">
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}

          {/* ================= TAB 2: INTERACTIVE SOLAR CALCULATOR ================= */}
          {activeTab === 'solar' && (
            <div className="assistant-solar">
              <div className="solar-summary-bar">
                <div>
                  <small>Consumo continuo</small>
                  <strong>{solarResult.continuousWatts} W</strong>
                </div>
                <div>
                  <small>Pico arranque</small>
                  <strong>{solarResult.peakSurgeWatts} W</strong>
                </div>
                <div>
                  <small>Batería necesaria ({blackoutHours}h)</small>
                  <strong>{solarResult.requiredWh.toLocaleString('es-CU')} Wh</strong>
                </div>
              </div>

              <div className="solar-hours-row">
                <label htmlFor="solar-hours-range">
                  Duración estimada del apagón: <strong>{blackoutHours} horas</strong>
                </label>
                <input
                  id="solar-hours-range"
                  type="range"
                  min={2}
                  max={24}
                  step={1}
                  value={blackoutHours}
                  onChange={(e) => setBlackoutHours(Number(e.target.value))}
                />
              </div>

              <div className="solar-appliance-grid">
                {SOLAR_APPLIANCES.map((app) => {
                  const qty = solarSelections[app.id] || 0;
                  return (
                    <div key={app.id} className={`solar-app-card ${qty > 0 ? 'is-on' : ''}`}>
                      <div>
                        <strong>{app.name}</strong>
                        <small>{app.watts}W · Pico {app.surgeWatts}W</small>
                      </div>
                      <div className="solar-app-card__ctrl">
                        <button
                          type="button"
                          onClick={() => adjustAppliance(app.id, -1)}
                          aria-label={`Quitar ${app.name}`}
                        >
                          −
                        </button>
                        <span>{qty}</span>
                        <button
                          type="button"
                          onClick={() => adjustAppliance(app.id, 1)}
                          aria-label={`Agregar ${app.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="solar-results-head">
                <h4>
                  <Zap size={15} /> Mejores equipos recomendados del catálogo
                </h4>
                {solarResult.recommendations.length > 0 && (
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    disabled={quoteBusy}
                    onClick={() =>
                      handleDownloadItemsPdf(
                        solarResult.recommendations.map((r) => r.product)
                      )
                    }
                  >
                    <FileDown size={14} /> Cotizar en PDF
                  </button>
                )}
              </div>

              <div className="assistant-solar-recs">
                {solarResult.recommendations.map((rec) => {
                  const pr = getClientFacingPrice(
                    rec.product,
                    displayCurrency,
                    settings.usd_to_cup_rate,
                    reseller
                  );
                  return (
                    <div key={rec.product.id} className="assistant-mini-card">
                      <SmartImage
                        src={rec.product.image_url}
                        alt={rec.product.title}
                        className="assistant-mini-card__img"
                      />
                      <div className="assistant-mini-card__info">
                        <span className={`spec-pill spec-pill--${rec.fitTone}`}>
                          {rec.fitLabel}
                        </span>
                        <strong>{rec.product.title}</strong>
                        <span className="assistant-mini-card__price">
                          {pr.formatted}
                          {rec.estimatedHours ? ` · ~${rec.estimatedHours}h con tu carga` : ''}
                        </span>
                      </div>
                      <div className="assistant-mini-card__actions">
                        <button
                          type="button"
                          className="btn-ghost-sm"
                          onClick={() => onOpenProduct(rec.product)}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          className="btn-primary-sm"
                          onClick={() =>
                            onAddToCart(rec.product, rec.product.sizes[0] || 'Disponible')
                          }
                        >
                          <ShoppingBag size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= TAB 3: MOBILE-FIRST COMPARATOR ================= */}
          {activeTab === 'compare' && (
            <div className="assistant-compare">
              {compareProducts.length > 0 ? (
                <>
                  <div className="compare-selected-strip">
                    {compareProducts.map((p) => {
                      const pr = getClientFacingPrice(
                        p,
                        displayCurrency,
                        settings.usd_to_cup_rate,
                        reseller
                      );
                      return (
                        <div key={p.id} className="compare-pill-card">
                          <SmartImage
                            src={p.image_url}
                            alt={p.title}
                            className="compare-pill-card__img"
                          />
                          <div className="compare-pill-card__meta">
                            <strong>{p.title}</strong>
                            <span>{pr.formatted}</span>
                          </div>
                          <button
                            type="button"
                            className="compare-pill-card__rm"
                            onClick={() => onToggleCompare(p.id)}
                            aria-label={`Quitar ${p.title}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="btn-ghost-sm"
                      onClick={onClearCompare}
                    >
                      Limpiar
                    </button>
                  </div>

                  {/* Mobile-first grouped attribute cards + Desktop full matrix */}
                  <div className="compare-attr-list">
                    {matrix.rows.map((row) => (
                      <div key={row.key} className="compare-attr-card">
                        <span className="compare-attr-card__label">{row.label}</span>
                        <div className="compare-attr-card__vals">
                          {matrix.products.map((prod, idx) => {
                            const isWinner = row.winnerIndices.includes(idx);
                            return (
                              <div
                                key={prod.id}
                                className={`compare-val-cell ${isWinner ? 'is-winner' : ''}`}
                              >
                                <small>{prod.title}</small>
                                <span>
                                  {row.values[idx]}
                                  {isWinner ? ' · Mejor' : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="compare-footer-actions">
                    <button
                      type="button"
                      className="btn-primary-sm"
                      disabled={quoteBusy}
                      onClick={() => handleDownloadItemsPdf(compareProducts)}
                    >
                      <FileDown size={15} /> Descargar Comparativa PDF
                    </button>
                  </div>
                </>
              ) : (
                <div className="compare-empty">
                  <strong>Elige 2 o 3 modelos para comparar</strong>
                  <p>
                    Toca el ícono de balanza en cualquier moto o equipo solar, o agrégalos directo aquí abajo:
                  </p>
                </div>
              )}

              {compareProducts.length < 3 && (
                <div className="compare-picker">
                  <input
                    type="search"
                    value={compareSearch}
                    onChange={(e) => setCompareSearch(e.target.value)}
                    placeholder="Buscar moto, motor o planta para comparar..."
                    aria-label="Buscar producto para comparar"
                  />
                  <div className="compare-picker-list">
                    {comparePickPool.map((p) => {
                      const pr = getClientFacingPrice(
                        p,
                        displayCurrency,
                        settings.usd_to_cup_rate,
                        reseller
                      );
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="compare-pick-row"
                          onClick={() => onToggleCompare(p.id)}
                        >
                          <SmartImage
                            src={p.image_url}
                            alt={p.title}
                            className="compare-pick-row__img"
                          />
                          <div>
                            <strong>{p.title}</strong>
                            <small>{pr.formatted}</small>
                          </div>
                          <Plus size={16} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 4: KIT & REMOTORIZATION BUILDER ================= */}
          {activeTab === 'kit' && (
            <div className="assistant-kit">
              <div className="kit-mode-switch">
                <button
                  type="button"
                  className={kitMode === 'mobility' ? 'is-active' : ''}
                  onClick={() => setKitMode('mobility')}
                >
                  🏍️ Remotorizar / Batería
                </button>
                <button
                  type="button"
                  className={kitMode === 'solar' ? 'is-active' : ''}
                  onClick={() => setKitMode('solar')}
                >
                  ☀️ Kit Solar Completo
                </button>
              </div>

              {kitMode === 'mobility' ? (
                <>
                  <div className="kit-frame-pills">
                    {[
                      { key: 'suzuki_criollo' as const, label: 'Cuadro Suzuki / Criollo' },
                      { key: 'triciclo' as const, label: 'Triciclo / Carga' },
                      { key: 'electrica_bateria' as const, label: 'Motorina / Batería Litio' },
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`quick-chip ${frameType === f.key ? 'is-active' : ''}`}
                        onClick={() => setFrameType(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <p className="kit-subtitle">{mobOptions.subtitle}</p>

                  <label className="kit-select-label">
                    1. Unidad / Batería principal
                    <select
                      value={selectedMobPrimaryId}
                      onChange={(e) => setSelectedMobPrimaryId(e.target.value)}
                    >
                      {mobOptions.primaryItems.map((p) => {
                        const pr = getClientFacingPrice(
                          p,
                          displayCurrency,
                          settings.usd_to_cup_rate,
                          reseller
                        );
                        return (
                          <option key={p.id} value={p.id}>
                            {p.title} ({pr.formatted})
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  {mobOptions.accessoryItems.length > 0 && (
                    <label className="kit-select-label">
                      2. Complemento opcional
                      <select
                        value={selectedMobAccId}
                        onChange={(e) => setSelectedMobAccId(e.target.value)}
                      >
                        <option value="">Ninguno por ahora</option>
                        {mobOptions.accessoryItems.map((p) => {
                          const pr = getClientFacingPrice(
                            p,
                            displayCurrency,
                            settings.usd_to_cup_rate,
                            reseller
                          );
                          return (
                            <option key={p.id} value={p.id}>
                              {p.title} ({pr.formatted})
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <p className="kit-subtitle">
                    Combina Inversor + Batería LiFePO4 + Panel Solar con precios reales de tienda:
                  </p>
                  <label className="kit-select-label">
                    1. Inversor Híbrido
                    <select
                      value={selectedInvId}
                      onChange={(e) => setSelectedInvId(e.target.value)}
                    >
                      <option value="">Omitir inversor</option>
                      {solarKitOptions.inverters.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} (${priceInUsd(p.price, p.currency, settings.usd_to_cup_rate) ?? '—'} USD)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="kit-select-label">
                    2. Batería LiFePO4
                    <select
                      value={selectedBatId}
                      onChange={(e) => setSelectedBatId(e.target.value)}
                    >
                      <option value="">Omitir batería</option>
                      {solarKitOptions.batteries.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} (${priceInUsd(p.price, p.currency, settings.usd_to_cup_rate) ?? '—'} USD)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="kit-select-label">
                    3. Panel Solar
                    <select
                      value={selectedPanelId}
                      onChange={(e) => setSelectedPanelId(e.target.value)}
                    >
                      <option value="">Omitir panel</option>
                      {solarKitOptions.panels.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} (${priceInUsd(p.price, p.currency, settings.usd_to_cup_rate) ?? '—'} USD)
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <div className="kit-summary-box">
                <div>
                  <small>Total estimado del paquete ({activeKitProducts.length} piezas)</small>
                  <strong>${kitTotalUsd.toLocaleString('es-CU')} USD</strong>
                  <span>
                    {Math.round(kitTotalUsd * settings.usd_to_cup_rate).toLocaleString('es-CU')} CUP
                  </span>
                </div>
                <div className="kit-summary-actions">
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    disabled={quoteBusy || activeKitProducts.length === 0}
                    onClick={() => handleDownloadItemsPdf(activeKitProducts)}
                  >
                    <FileDown size={15} /> Cotizar PDF
                  </button>
                  <button
                    type="button"
                    className="btn-primary-sm"
                    disabled={activeKitProducts.length === 0}
                    onClick={() => {
                      activeKitProducts.forEach((p) =>
                        onAddToCart(p, p.sizes[0] || 'Disponible')
                      );
                      onClose();
                    }}
                  >
                    <ShoppingBag size={15} /> Agregar Kit al Carrito
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
