type AddOnLike = { id: string; name: string };

export function addOnLabel(item: AddOnLike, t: (key: string) => string): string {
  if (item.id === 'note') return t('handwrittenNote');
  if (item.id === 'chocolate') return t('darkChocolate');
  if (item.id === 'balloon') return t('balloon');
  return item.name;
}
