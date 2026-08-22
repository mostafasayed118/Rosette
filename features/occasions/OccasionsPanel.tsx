'use client';

import { useState } from 'react';
import { removeOccasion, saveOccasion } from './actions';
import { OccasionForm } from './OccasionForm';
import { OccasionList } from './OccasionList';
import type { OccasionRow } from './repository';

type PanelProps = {
  occasions: OccasionRow[];
  recipients: Array<{ id: string; name: string; relationship: string | null }>;
  accountPath: string;
};

export function OccasionsPanel({ occasions, recipients, accountPath }: PanelProps) {
  const [rows, setRows] = useState(occasions);

  async function handleRemove(id: string) {
    const result = await removeOccasion(id, accountPath);
    if (result === 'deleted') setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
      <OccasionList occasions={rows} onRemove={handleRemove} />
      <OccasionForm
        recipients={recipients}
        onSubmit={(payload) => saveOccasion({ ...payload, accountPath })}
      />
    </div>
  );
}
