import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceIcon } from './WorkspaceIcon';
import './WorkspaceActionsMenu.css';

type Action = {
  label: string;
  icon: ComponentProps<typeof WorkspaceIcon>['name'];
  onSelect: () => void;
  danger?: boolean;
};

export function WorkspaceActionsMenu({ label, actions, disabled = false }: { label: string; actions: Action[]; disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current || !menu.current) return;
      const anchor = trigger.current.getBoundingClientRect(), bounds = menu.current.getBoundingClientRect();
      if (anchor.bottom <= 0 || anchor.top >= innerHeight) { setOpen(false); return; }
      setPosition({ left: Math.max(8, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - 8)),
        top: Math.max(8, Math.min(anchor.bottom + bounds.height + 12 > innerHeight ? anchor.top - bounds.height - 6 : anchor.bottom + 6, innerHeight - bounds.height - 8)) });
    }
    function dismiss(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    }
    place(); menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    document.addEventListener('pointerdown', dismiss); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className="workspace-actions-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}><WorkspaceIcon name="more" /></button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} className="workspace-actions-menu" style={position} onKeyDown={(event) => {
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])], current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') close();
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>{actions.map((action) => <button type="button" role="menuitem" key={action.label} className={action.danger ? 'workspace-action-danger' : ''} onClick={() => { close(); action.onSelect(); }}><WorkspaceIcon name={action.icon} />{action.label}</button>)}</div>, document.body)}
  </>;
}
