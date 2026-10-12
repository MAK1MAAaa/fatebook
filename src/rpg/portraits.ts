import type { ActorId, CharacterConfig } from '../game/types';

export const CAST_PORTRAIT_KEYS = [
  'rudeus', 'eris', 'sylphie', 'roxy', 'ruijerd', 'ghislaine',
  'zanoba', 'cliff', 'elinalise', 'orsted',
  'rudeus-child', 'eris-child', 'sylphie-child', 'roxy-child',
  'custom-human', 'custom-elf', 'custom-beast', 'custom-migurd',
  'custom-human-child', 'custom-elf-child', 'custom-beast-child', 'custom-migurd-child',
] as const;

export interface PortraitDefinition {
  key: string;
  full: string;
  thumb: string;
  objectPosition: string;
  source: 'original-fan-art' | 'original-if';
}

const keys = [
  ...CAST_PORTRAIT_KEYS,
  ...Array.from({ length: 32 }, (_, index) => `enemy-${index + 1}`),
  ...Array.from({ length: 14 }, (_, index) => `boss-${index + 1}`).filter(key => key !== 'boss-6'),
];

// Display assets are resolved from existing identity data, never written to a save.
export const PORTRAITS: Record<string, PortraitDefinition> = Object.fromEntries(keys.map(key => [key, {
  key,
  full: `/art/portraits/${key}.webp`,
  thumb: `/art/portraits/${key}-thumb.webp`,
  objectPosition: 'center bottom',
  source: key.startsWith('enemy-') || key.startsWith('boss-') || key.startsWith('custom-') ? 'original-if' : 'original-fan-art',
}]));

const birthYears: Partial<Record<ActorId, number>> = { rudeus: 407, eris: 405, sylphie: 407, roxy: 373 };

export function characterPortraitKey(character: Pick<CharacterConfig, 'actor' | 'race'>, age = 16, year?: number): string {
  const key = character.actor === 'custom' ? `custom-${character.race}` : character.actor;
  // Sylphie's white hair follows the displacement event, not adulthood.
  const childhood = character.actor === 'sylphie' ? (year === undefined ? age < 10 : year < 417) : age < 15;
  return childhood ? `${key}-child` : key;
}

export function companionPortraitKey(companionId: string, year: number): string {
  const birthYear = birthYears[companionId as ActorId];
  return birthYear === undefined ? companionId : characterPortraitKey({ actor: companionId as ActorId, race: 'human' }, Math.max(0, year - birthYear), year);
}

export function enemyPortraitKey(definitionId: string): string {
  return definitionId === 'boss-6' ? 'orsted' : definitionId;
}

export function portraitDefinition(key: string | undefined): PortraitDefinition | undefined {
  return key ? PORTRAITS[key] : undefined;
}
