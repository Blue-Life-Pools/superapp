import type { InputHTMLAttributes } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';
import './SearchField.css';

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string };

export function SearchField({ wrapperClassName = '', className = '', type = 'search', ...props }: SearchFieldProps) {
  return <span className={`workspace-search ${wrapperClassName}`.trim()}>
    <WorkspaceIcon name="search" />
    <input {...props} type={type} className={`workspace-search-input ${className}`.trim()} />
  </span>;
}
