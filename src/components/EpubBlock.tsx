import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { RichTextBlock } from '../types';

interface Props {
  block: RichTextBlock;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  fontFamily: string | undefined;
  isDark: boolean;
  highlightRange?: { start: number; end: number };
}

interface Fragment {
  text: string;
  highlighted: boolean;
}

function splitWithHighlight(text: string, range?: { start: number; end: number }): Fragment[] {
  if (!range || range.start >= range.end) return [{ text, highlighted: false }];
  const { start, end } = range;
  const clamped = { start: Math.max(0, start), end: Math.min(text.length, end) };
  const parts: Fragment[] = [];
  if (clamped.start > 0) parts.push({ text: text.slice(0, clamped.start), highlighted: false });
  parts.push({ text: text.slice(clamped.start, clamped.end), highlighted: true });
  if (clamped.end < text.length) parts.push({ text: text.slice(clamped.end), highlighted: false });
  return parts.filter(p => p.text.length > 0);
}

const TYPE_FONT_SCALE: Record<RichTextBlock['type'], number> = {
  h1: 1.5,
  h2: 1.3,
  h3: 1.15,
  p: 1,
  blockquote: 1,
};

const TYPE_FONT_WEIGHT: Record<RichTextBlock['type'], 'bold' | 'normal'> = {
  h1: 'bold',
  h2: 'bold',
  h3: 'bold',
  p: 'normal',
  blockquote: 'normal',
};

export default function EpubBlock({ block, fontSize, lineHeight, textColor, fontFamily, isDark, highlightRange }: Props) {
  const fragments = useMemo(() => splitWithHighlight(block.text, highlightRange), [block.text, highlightRange]);

  const scaledFontSize = fontSize * TYPE_FONT_SCALE[block.type];
  const scaledLineHeight = lineHeight * TYPE_FONT_SCALE[block.type];
  const fontWeight = TYPE_FONT_WEIGHT[block.type];
  const marginTop = block.type.startsWith('h') ? 12 : 0;

  return (
    <Text
      style={[
        styles.base,
        { fontSize: scaledFontSize, lineHeight: scaledLineHeight, color: textColor, fontFamily, fontWeight, marginTop },
        block.type === 'blockquote' && styles.blockquote,
      ]}
    >
      {fragments.map((f, i) => (
        <Text
          key={i}
          style={f.highlighted
            ? { backgroundColor: isDark ? '#3A2E12' : '#F7E8C4', color: textColor }
            : undefined}
        >
          {f.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    marginBottom: 8,
  },
  blockquote: {
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#999',
    fontStyle: 'italic',
  },
});
