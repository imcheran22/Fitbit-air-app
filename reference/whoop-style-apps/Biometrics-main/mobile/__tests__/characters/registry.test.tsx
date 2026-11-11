import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { CHARACTERS, characterInfo } from '../../src/components/characters/registry';
import { CHARACTER_IDS, DEFAULT_CHARACTER_ID, isCharacterId } from '../../src/components/characters/types';
import {
  THINKING_ATTACHMENTS,
  THINKING_TEXTS,
  DEFAULT_THINKING_ATTACHMENT,
  DEFAULT_THINKING_TEXT,
  THINKING_ATTACHMENT_NAMES,
  THINKING_TEXT_NAMES,
  isThinkingAttachment,
  isThinkingText,
} from '../../src/components/characters/thinking';
import { CharacterContext, useCharacter, useCharacterOptional, type CharacterContextValue } from '../../src/characters/CharacterContext';

describe('registry', () => {
  it('has the 15 coaches in picker order, Mochi default', () => {
    expect(CHARACTER_IDS).toEqual(['mochi', 'boba', 'sprout', 'avo', 'peep', 'bun', 'kit', 'axo', 'boo', 'cap', 'jelly', 'pengu', 'luna', 'gloop', 'bao']);
    expect(DEFAULT_CHARACTER_ID).toBe('mochi');
    expect(isCharacterId('hoot')).toBe(false);
  });

  it('has one entry per character id, keyed by its own id', () => {
    expect(Object.keys(CHARACTERS)).toEqual([...CHARACTER_IDS]);
    for (const id of CHARACTER_IDS) expect(CHARACTERS[id].id).toBe(id);
  });

  it('numbers cards 1–15 and gives every coach three thinking lines and copy', () => {
    CHARACTER_IDS.forEach((id, i) => {
      const c = CHARACTERS[id];
      expect(c.number).toBe(i + 1);
      expect(c.thinkingLines).toHaveLength(3);
      expect(c.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.focus && c.tagline && c.greeting).toBeTruthy();
    });
    expect(CHARACTERS.luna.thinkingLines[0]).toBe('counting stars');
  });

  it('matches the backend v4 persona ids, taglines and greetings exactly', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../backend/src/coach/personas/v4.ts'), 'utf8');
    const str = `(?:'([^']*)'|"([^"]*)")`;
    const re = new RegExp(`id: '([a-z]+)'.*?tagline: ${str}, greeting: ${str}`, 'g');
    const backend = [...source.matchAll(re)].map((m) => ({ id: m[1], tagline: m[2] ?? m[3], greeting: m[4] ?? m[5] }));
    // Mochi is carried over from v3 (which maps v2's copy); the other 14 are written out in v4.
    expect(backend.map((b) => b.id)).toEqual(CHARACTER_IDS.slice(1));
    for (const b of backend) {
      const c = CHARACTERS[b.id as keyof typeof CHARACTERS];
      expect(c.tagline).toBe(b.tagline);
      expect(c.greeting).toBe(b.greeting);
    }
    const v2 = fs.readFileSync(path.join(__dirname, '../../../backend/src/coach/personas/v2.ts'), 'utf8');
    expect(v2).toContain(`tagline: '${CHARACTERS.mochi.tagline}'`);
    expect(v2).toContain(`greeting: '${CHARACTERS.mochi.greeting}'`);
  });

  it('falls back to Mochi for unknown ids', () => {
    expect(characterInfo('kit').name).toBe('Kit');
    expect(characterInfo('hoot').id).toBe('mochi');
    expect(characterInfo('encouraging').id).toBe('mochi');
    expect(characterInfo(null).id).toBe('mochi');
    expect(characterInfo(undefined).id).toBe('mochi');
  });
});

describe('thinking settings', () => {
  it('lists the thinking settings with their defaults', () => {
    expect(THINKING_ATTACHMENTS).toHaveLength(9);
    expect(THINKING_TEXTS).toHaveLength(10);
    expect(DEFAULT_THINKING_ATTACHMENT).toBe('bulb');
    expect(DEFAULT_THINKING_TEXT).toBe('steps');
    expect(isThinkingAttachment('rocket')).toBe(false);
    expect(isThinkingAttachment('spinner')).toBe(true);
    expect(isThinkingText('__proto__')).toBe(false);
    expect(isThinkingText('dialog')).toBe(true);
  });

  it('names every attachment and text style', () => {
    expect(Object.keys(THINKING_ATTACHMENT_NAMES)).toEqual([...THINKING_ATTACHMENTS]);
    expect(Object.keys(THINKING_TEXT_NAMES)).toEqual([...THINKING_TEXTS]);
  });
});

describe('CharacterContext', () => {
  it('is null outside a provider for the optional hook', () => {
    const { result } = renderHook(() => useCharacterOptional());
    expect(result.current).toBeNull();
  });

  it('throws outside a provider for the required hook', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useCharacter())).toThrow('useCharacter must be used inside CharacterProvider');
    } finally {
      errors.mockRestore();
    }
  });

  it('returns the provided value', () => {
    const value = { characterId: 'kit' } as CharacterContextValue;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>
    );
    const { result } = renderHook(() => useCharacter(), { wrapper });
    expect(result.current.characterId).toBe('kit');
  });
});
