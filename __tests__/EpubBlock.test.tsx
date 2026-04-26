import { RichTextBlock } from '../src/types';

function splitWithHighlight(text: string, range?: { start: number; end: number }) {
  if (!range || range.start >= range.end) return [{ text, highlighted: false }];
  const { start, end } = range;
  const clamped = { start: Math.max(0, start), end: Math.min(text.length, end) };
  const parts: { text: string; highlighted: boolean }[] = [];
  if (clamped.start > 0) parts.push({ text: text.slice(0, clamped.start), highlighted: false });
  parts.push({ text: text.slice(clamped.start, clamped.end), highlighted: true });
  if (clamped.end < text.length) parts.push({ text: text.slice(clamped.end), highlighted: false });
  return parts.filter(p => p.text.length > 0);
}

describe('splitWithHighlight', () => {
  it('returns single unhighlighted fragment when no range', () => {
    const result = splitWithHighlight('Hello world');
    expect(result).toEqual([{ text: 'Hello world', highlighted: false }]);
  });

  it('splits into 3 fragments for a mid-text highlight', () => {
    const result = splitWithHighlight('Hello world.', { start: 6, end: 11 });
    expect(result).toEqual([
      { text: 'Hello ', highlighted: false },
      { text: 'world', highlighted: true },
      { text: '.', highlighted: false },
    ]);
  });

  it('highlights from beginning', () => {
    const result = splitWithHighlight('Hello world.', { start: 0, end: 5 });
    expect(result).toEqual([
      { text: 'Hello', highlighted: true },
      { text: ' world.', highlighted: false },
    ]);
  });

  it('highlights to end', () => {
    const result = splitWithHighlight('Hello world.', { start: 6, end: 12 });
    expect(result).toEqual([
      { text: 'Hello ', highlighted: false },
      { text: 'world.', highlighted: true },
    ]);
  });

  it('returns single unhighlighted when start >= end', () => {
    const result = splitWithHighlight('Hello', { start: 3, end: 3 });
    expect(result).toEqual([{ text: 'Hello', highlighted: false }]);
  });

  it('clamps range to text bounds', () => {
    const result = splitWithHighlight('Hi', { start: -5, end: 100 });
    expect(result).toEqual([{ text: 'Hi', highlighted: true }]);
  });
});
