import { useEffect, useRef, useState } from 'react';
import { GripVertical, ShoppingBag } from 'lucide-react';

interface FloatingCartButtonProps {
  totalUnits: number;
  onOpenCart: () => void;
}

const POS_STORAGE_KEY = 'yole_shop_floating_cart_pos_v1';
const BTN_SIZE = 58;
const MARGIN = 12;

function clampPos(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const maxX = Math.max(MARGIN, window.innerWidth - BTN_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - BTN_SIZE - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, x), maxX),
    y: Math.min(Math.max(MARGIN, y), maxY),
  };
}

function getDefaultPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 300, y: 500 };
  return clampPos(
    window.innerWidth - BTN_SIZE - 16,
    Math.round(window.innerHeight * 0.62)
  );
}

export function FloatingCartButton({ totalUnits, onOpenCart }: FloatingCartButtonProps) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 300, y: 500 };
    try {
      const raw = localStorage.getItem(POS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return clampPos(parsed.x, parsed.y);
        }
      }
    } catch {
      // ignore
    }
    return getDefaultPos();
  });

  const [dragging, setDragging] = useState(false);
  const justDraggedRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setPos((cur) => clampPos(cur.x, cur.y));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: pos.x,
      startY: pos.y,
      lastX: pos.x,
      lastY: pos.y,
      moved: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (Math.hypot(dx, dy) > 6) {
      d.moved = true;
    }
    if (d.moved) {
      const next = clampPos(d.startX + dx, d.startY + dy);
      d.lastX = next.x;
      d.lastY = next.y;
      setPos(next);
    }
  };

  const finishPointer = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);

    if (d.moved) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 120);
      try {
        localStorage.setItem(
          POS_STORAGE_KEY,
          JSON.stringify({ x: d.lastX, y: d.lastY })
        );
      } catch {
        // ignore
      }
    }
  };

  const handleClick = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onOpenCart();
  };

  return (
    <button
      type="button"
      className={`floating-cart-btn${dragging ? ' is-dragging' : ''}`}
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      aria-label={`Carrito flotante (${totalUnits} artículos). Toca para abrir o arrastra para mover`}
      title="Abrir carrito (arrástrame donde prefieras)"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onClick={handleClick}
    >
      <GripVertical size={11} className="floating-cart-btn__grip" aria-hidden="true" />
      <ShoppingBag size={21} />
      {totalUnits > 0 && <span className="floating-cart-btn__badge">{totalUnits}</span>}
    </button>
  );
}
