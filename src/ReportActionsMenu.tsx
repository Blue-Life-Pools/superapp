import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceIcon } from './WorkspaceIcon';

/** Render outside the scrolling history table so the last row's menu stays visible. */
export function ReportActionsMenu({ propertyName, solved, disabled, onSolve, onReopen, onEdit, onDelete }: {
  propertyName: string;
  solved: boolean;
  disabled: boolean;
  onSolve: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current || !menu.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = menu.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
        top: anchor.bottom + bounds.height + 12 > window.innerHeight
          ? Math.max(8, anchor.top - bounds.height - 6) : anchor.bottom + 6,
      });
    }
    function dismiss(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    }
    place();
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  function close() { setOpen(false); trigger.current?.focus(); }
  function select(action: () => void) { close(); action(); }

  return <>
    <button ref={trigger} type="button" className="reports-actions-trigger" aria-label={`Actions for ${propertyName}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => setOpen(!open)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}><WorkspaceIcon name="more" /></button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={`Report actions for ${propertyName}`}
      className="reports-actions-menu" style={position} onKeyDown={(event) => {
        const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') close();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
      <button type="button" role="menuitem" onClick={() => select(solved ? onReopen : onSolve)}><WorkspaceIcon name={solved ? 'refresh' : 'check'} />{solved ? 'Reopen' : 'Solve'}</button>
      <button type="button" role="menuitem" onClick={() => select(onEdit)}><WorkspaceIcon name="edit" />Edit</button>
      <button type="button" role="menuitem" className="reports-menu-delete" onClick={() => select(onDelete)}><WorkspaceIcon name="trash" />Delete</button>
    </div>, document.body)}
  </>;
}
