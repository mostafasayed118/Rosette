'use client';

import { useState } from 'react';
import { editOccasion, removeOccasion, saveOccasion } from './actions';
import { OccasionForm } from './OccasionForm';
import { OccasionList } from './OccasionList';
import type { OccasionRow } from './repository';

type PanelProps = {
  occasions: OccasionRow[];
  recipients: Array<{ id: string; name: string; relationship: string | null }>;
  accountPath: string;
};

export function OccasionsPanel({ occasions, recipients, accountPath }: PanelProps) {
  const [editing, setEditing] = useState<OccasionRow | null>(null);

  async function handleRemove(id: string) {
    const result = await removeOccasion(id, accountPath);
    if (result === 'deleted') setEditing((current) => (current?.id === id ? null : current));
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
      <OccasionList occasions={occasions} onRemove={handleRemove} onEdit={setEditing} />
      <OccasionForm
        key={editing?.id ?? 'new'}
        initial={
          editing
            ? {
                recipientName: editing.recipientName,
                relationship: editing.relationship ?? undefined,
                kind: editing.kind,
                recurrence: editing.recurrence,
                month: editing.month,
                day: editing.day,
                eventDate: editing.eventDate,
                leadDays: editing.leadDays,
              }
            : undefined
        }
        recipients={recipients}
        onSubmit={async (payload) => {
          const result = editing
            ? await editOccasion(editing.id, { ...payload, accountPath })
            : await saveOccasion({ ...payload, accountPath });
          if (result === 'saved') setEditing(null);
          return result;
        }}
      />
    </div>
  );
}
