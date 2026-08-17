import type { ReactNode } from 'react';

type ModalProps = { title: string; children: ReactNode; onClose: () => void };

export function Modal({ title, children, onClose }: ModalProps) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="text-button" type="button" onClick={onClose} aria-label="Close dialog">Close</button></div>{children}</div></div>;
}
