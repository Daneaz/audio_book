import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect, ClipPath, Defs, G } from 'react-native-svg';

const HAIR_COLORS  = ['#1A0F0A', '#3D1C02', '#7B3F00', '#A0522D', '#B8860B', '#4A3728', '#5C4033'];
const SKIN_TONES   = ['#FDDCBA', '#F5C89A', '#D4956A', '#C68642', '#9B6437'];
const SHIRT_COLORS = ['#4A8FD9', '#E8761A', '#3DAA72', '#9B6BC4', '#D94040', '#1AA8A8', '#C9A020', '#6B8DD9'];

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}
function pick<T>(arr: T[], n: number): T { return arr[Math.abs(n) % arr.length]; }
function darken(hex: string, amt = 30): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const d = (v: number) => Math.max(0, v-amt).toString(16).padStart(2,'0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

interface Props {
  gender?: 'male' | 'female' | 'neutral';
  seed: string;
  size?: number;
}

export function VoiceAvatar({ gender, seed, size = 38 }: Props) {
  const h = hash(seed);
  const hair  = pick(HAIR_COLORS,  h);
  const skin  = pick(SKIN_TONES,   h >> 3);
  const shirt = pick(SHIRT_COLORS, h >> 6);
  const skinD = darken(skin, 24);
  const hairD = darken(hair, 15);
  const isFemale = gender === 'female';
  const isMale   = gender === 'male';
  const clipId   = `av_${seed.replace(/[^a-zA-Z0-9]/g,'_')}`;

  // Tint background slightly by gender for extra cue
  const bgColor = isFemale ? '#F7EEF4' : isMale ? '#EEF2F7' : '#F2EAE0';

  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx="22" cy="22" r="22" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        {/* bg */}
        <Rect x="0" y="0" width="44" height="44" fill={bgColor} />

        {/* ── FEMALE: long hair behind face ── */}
        {isFemale && (
          <>
            {/* left hair panel — wide, clearly visible */}
            <Path
              d="M11 15 Q6 18 5 30 Q5.5 38 9 44 L16 44 Q13 36 12.5 26 Q12 18 13 15 Z"
              fill={hair}
            />
            {/* right hair panel */}
            <Path
              d="M33 15 Q38 18 39 30 Q38.5 38 35 44 L28 44 Q31 36 31.5 26 Q32 18 31 15 Z"
              fill={hair}
            />
            {/* top hair arc */}
            <Ellipse cx="22" cy="11" rx="11" ry="6.5" fill={hair} />
            <Path d="M11 11 Q11 7 14 6 Q22 3.5 30 6 Q33 7 33 11" fill={hair} />
          </>
        )}

        {/* ── MALE: short hair only on top ── */}
        {isMale && (
          <>
            <Ellipse cx="22" cy="10.5" rx="11" ry="5.5" fill={hair} />
            <Path d="M11 12 Q11 7 14 6 Q22 4 30 6 Q33 7 33 12" fill={hair} />
            {/* hard fade on temples */}
            <Rect x="11" y="12" width="3" height="4" rx="1.5" fill={hair} />
            <Rect x="30" y="12" width="3" height="4" rx="1.5" fill={hair} />
          </>
        )}

        {/* ── NEUTRAL: generic hair ── */}
        {!isFemale && !isMale && (
          <>
            <Ellipse cx="22" cy="10.5" rx="10.5" ry="5.5" fill={hair} />
            <Path d="M11.5 12 Q11 7 14 6 Q22 4 30 6 Q33 7 32.5 12" fill={hair} />
          </>
        )}

        {/* shirt */}
        <Path
          d={isFemale
            ? 'M7 40 Q11 34 16 33 L22 37 L28 33 Q33 34 37 40 L37 44 L7 44 Z'
            : 'M6 40 Q10 34 16 33 L22 37 L28 33 Q34 34 38 40 L38 44 L6 44 Z'}
          fill={shirt}
        />
        {/* neck */}
        <Rect x="19.5" y="30" width="5" height="5" rx="1" fill={skin} />

        {/* face */}
        <Ellipse cx="22" cy="21.5" rx="10.5" ry="11.5" fill={skin} />

        {/* ── MALE: solid beard ── */}
        {isMale && (
          <>
            {/* beard fill — solid, not just overlay */}
            <Path
              d="M13.5 26 Q12 30 13 34 Q16 38 22 38 Q28 38 31 34 Q32 30 30.5 26 Q27 28 22 28 Q17 28 13.5 26 Z"
              fill={hairD}
              opacity="0.55"
            />
            {/* mustache */}
            <Path
              d="M17.5 25.5 Q20 27 22 26 Q24 27 26.5 25.5"
              stroke={hair} strokeWidth="1.8" fill="none" strokeLinecap="round"
            />
          </>
        )}

        {/* cheek blush */}
        <Ellipse cx="13" cy="24" rx="3" ry="2" fill="#E08080" opacity={isFemale ? 0.28 : 0.16} />
        <Ellipse cx="31" cy="24" rx="3" ry="2" fill="#E08080" opacity={isFemale ? 0.28 : 0.16} />

        {/* eyebrows — thicker for male */}
        <Path d="M14.5 16 Q17 14.5 19.5 15.5"
          stroke={hair} strokeWidth={isMale ? '1.8' : '1.1'} fill="none" strokeLinecap="round" />
        <Path d="M24.5 15.5 Q27 14.5 29.5 16"
          stroke={hair} strokeWidth={isMale ? '1.8' : '1.1'} fill="none" strokeLinecap="round" />

        {/* eyes */}
        <Ellipse cx="17.5" cy="19.5" rx="2.4" ry="2.6" fill="white" />
        <Ellipse cx="26.5" cy="19.5" rx="2.4" ry="2.6" fill="white" />
        <Circle cx="18" cy="19.8" r="1.55" fill="#1A0F0A" />
        <Circle cx="27" cy="19.8" r="1.55" fill="#1A0F0A" />
        <Circle cx="18.7" cy="19.1" r="0.6" fill="white" />
        <Circle cx="27.7" cy="19.1" r="0.6" fill="white" />

        {/* eyelashes — female only */}
        {isFemale && (
          <>
            <Path d="M15.4 17.5 L14.4 16.5" stroke={hair} strokeWidth="1" strokeLinecap="round" />
            <Path d="M17.5 16.9 L17.2 15.7" stroke={hair} strokeWidth="1" strokeLinecap="round" />
            <Path d="M19.6 17.5 L20.4 16.5" stroke={hair} strokeWidth="1" strokeLinecap="round" />
            <Path d="M24.4 17.5 L23.6 16.5" stroke={hair} strokeWidth="1" strokeLinecap="round" />
            <Path d="M26.5 16.9 L26.8 15.7" stroke={hair} strokeWidth="1" strokeLinecap="round" />
            <Path d="M28.6 17.5 L29.6 16.5" stroke={hair} strokeWidth="1" strokeLinecap="round" />
          </>
        )}

        {/* nose */}
        <Ellipse cx="22" cy="23" rx="1.2" ry="0.85" fill={skinD} opacity="0.35" />

        {/* mouth */}
        <Path
          d={isMale ? 'M18.5 26 Q22 28.5 25.5 26' : 'M18.5 26 Q22 29 25.5 26'}
          stroke={isFemale ? '#C8506A' : '#904040'}
          strokeWidth="1.3" fill="none" strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
