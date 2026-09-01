/**
 * Ellipsis pagination — renders at most 7 buttons:
 * 1 … 4 5 6 … 20
 */
export function getPaginationRange(current: number, total: number, siblingCount = 1): (number | 'ellipsis')[] {
  const range: (number | 'ellipsis')[] = [];
  const totalNumbers = siblingCount * 2 + 5; // first, last, current, 2*siblings, 2 ellipsis

  if (total <= totalNumbers) {
    for (let i = 1; i <= total; i++) range.push(i);
    return range;
  }

  const left = Math.max(2, current - siblingCount);
  const right = Math.min(total - 1, current + siblingCount);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < total - 1;

  range.push(1);
  if (showLeftEllipsis) range.push('ellipsis');
  for (let i = left; i <= right; i++) range.push(i);
  if (showRightEllipsis) range.push('ellipsis');
  range.push(total);
  return range;
}
