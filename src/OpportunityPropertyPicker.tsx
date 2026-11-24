import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';

const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function OpportunityPropertyPicker({ properties, value, onSelect }: { properties: string[]; value: string; onSelect: (name: string) => void }) {
  const id = useId();
  const listId = id + '-properties';
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const term = searchKey(query ?? '');
  const matches = term ? properties.filter(name => searchKey(name).includes(term)) : properties;

  function close() {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }

  function choose(name: string) {
    onSelect(name);
    close();
  }

  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(current => matches.length ? (current < 0 ? (step === 1 ? 0 : matches.length - 1) : Math.max(0, Math.min(matches.length - 1, current + step))) : -1);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const match = matches[active] ?? (query && matches.length === 1 ? matches[0] : undefined);
      if (match) choose(match);
    }
  }

  return <div className="opportunity-property-picker">
    <label htmlFor={id}><span>Property *</span></label>
    <div className="opportunity-property-picker-control">
      <input id={id} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-activedescendant={open && matches[active] ? listId + '-' + active : undefined}
        aria-required="true" autoComplete="off" placeholder="Search properties" value={query ?? value}
        onFocus={event => { setOpen(true); event.currentTarget.select(); }}
        onClick={() => setOpen(true)} onBlur={close} onKeyDown={onKeyDown}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }} />
      <button type="button" aria-label="Show properties" tabIndex={-1} onMouseDown={event => event.preventDefault()}
        onClick={() => {
          if (open) close();
          else { input.current?.focus(); input.current?.select(); setOpen(true); }
        }}><WorkspaceIcon name="chevron-right" /></button>
      {open && <div className="opportunity-property-picker-menu">
        <ul id={listId} ref={list} role="listbox" aria-label="Active properties">
          {matches.map((name, index) => <li id={listId + '-' + index} key={name} role="option" aria-selected={name === value}
            className={active === index ? 'is-highlighted' : undefined} onMouseDown={event => event.preventDefault()} onClick={() => choose(name)}>{name}</li>)}
        </ul>
        {!matches.length && <span role="status">No matching properties.</span>}
      </div>}
    </div>
  </div>;
}
