import { useEffect, useRef, useState } from 'react';

const FREE_TARGET =
  'input, textarea, select, [contenteditable="true"], [data-copiable], [data-reorder]';
const PROTECTED_MESSAGE =
  'Contenido y diseño protegidos · Yole Shop por Studio Lexair';

function isFreeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(FREE_TARGET));
}

function isBlockedHotkey(e: KeyboardEvent): boolean {
  const k = e.key.toUpperCase();
  if (k === 'F12') return true;
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return false;
  if (k === 'U' || k === 'S') return true;
  if (e.shiftKey && (k === 'I' || k === 'J' || k === 'C')) return true;
  return false;
}

/** Protección de contenido y diseño alineada con la plataforma Studio Lexair. */
export function ContentGuard() {
  const [notice, setNotice] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const showNotice = () => {
      setNotice(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setNotice(false), 2800);
    };

    const onContext = (e: MouseEvent) => {
      if (isFreeTarget(e.target)) return;
      e.preventDefault();
      showNotice();
    };

    const onDrag = (e: DragEvent) => {
      if (isFreeTarget(e.target)) return;
      e.preventDefault();
    };

    const onSelect = (e: Event) => {
      if (isFreeTarget(e.target)) return;
      e.preventDefault();
    };

    const onClipboard = (e: ClipboardEvent) => {
      if (isFreeTarget(e.target)) return;
      e.preventDefault();
      showNotice();
    };

    const onKey = (e: KeyboardEvent) => {
      if (!isBlockedHotkey(e)) return;
      e.preventDefault();
      showNotice();
    };

    document.addEventListener('contextmenu', onContext);
    document.addEventListener('dragstart', onDrag);
    document.addEventListener('selectstart', onSelect);
    document.addEventListener('copy', onClipboard);
    document.addEventListener('cut', onClipboard);
    document.addEventListener('keydown', onKey);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('dragstart', onDrag);
      document.removeEventListener('selectstart', onSelect);
      document.removeEventListener('copy', onClipboard);
      document.removeEventListener('cut', onClipboard);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!notice) return null;
  return (
    <div className="guard-toast" role="status" aria-live="polite">
      {PROTECTED_MESSAGE}
    </div>
  );
}
