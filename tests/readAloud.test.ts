import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  chunkForPara,
  DEFAULT_VOICE,
  isOfflineVoice,
  languageLabel,
  parseSpeed,
  pickVoices,
  SPEEDS,
  splitSentences,
  splitText,
  toChunks,
  voiceOptions,
  type VoiceInfo,
} from '../src/lib/readAloud.ts';

const v = (identifier: string, language: string, quality = 'Default'): VoiceInfo => ({ identifier, name: identifier, language, quality });

test('speeds are exactly 1x to 2x in quarter steps', () => {
  assert.deepEqual([...SPEEDS], [1, 1.25, 1.5, 1.75, 2]);
  assert.equal(parseSpeed('1.75'), 1.75);
  assert.equal(parseSpeed('3'), 1);
  assert.equal(parseSpeed(null), 1);
  assert.equal(parseSpeed('abc'), 1);
});

test('short paragraphs are one chunk each; blank and separator lines are skipped', () => {
  const chunks = toChunks(['Hello there.', '* * *', '', 'Second one!']);
  assert.deepEqual(chunks, [
    { para: 0, text: 'Hello there.', at: 0, start: 0, end: 12 },
    { para: 3, text: 'Second one!', at: 0, start: 0, end: 11 },
  ]);
});

test('long paragraphs split at sentence ends within the limit', () => {
  const s = 'This is a sentence that goes on for a bit. ';
  const para = s.repeat(30).trim();
  const pieces = splitText(para, 200);
  assert.ok(pieces.length > 1);
  for (const p of pieces) {
    assert.ok(p.text.length <= 200, `piece too long: ${p.text.length}`);
    assert.ok(p.text.endsWith('.'), 'should end at a sentence');
    assert.equal(para.slice(p.start, p.start + p.text.length), p.text);
  }
  // Nothing is lost.
  assert.equal(pieces.map((p) => p.text).join(' '), para);
});

test('text without sentence ends splits at spaces, and a giant word is cut', () => {
  const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
  for (const p of splitText(words, 50)) assert.ok(p.text.length <= 50 && !p.text.startsWith(' '));
  const giant = 'x'.repeat(120);
  assert.deepEqual(
    splitText(giant, 50).map((p) => p.text.length),
    [50, 50, 20],
  );
});

test('chunk positions inside a paragraph go from 0 towards 1', () => {
  const para = 'One sentence here. '.repeat(40).trim();
  const chunks = toChunks([para], 100);
  assert.equal(chunks[0].at, 0);
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].at > chunks[i - 1].at && chunks[i].at < 1);
});

test('chunkForPara finds the paragraph, or the next one with speech', () => {
  const chunks = toChunks(['A.', '***', 'B.', 'C.']);
  assert.equal(chunkForPara(chunks, 0), 0);
  assert.equal(chunkForPara(chunks, 1), 1); // separator: starts at B
  assert.equal(chunks[chunkForPara(chunks, 3)].text, 'C.');
  assert.equal(chunkForPara(chunks, 99), 0);
});

test('network voices are left out', () => {
  assert.equal(isOfflineVoice(v('en-us-x-sfg-network', 'en-US')), false);
  assert.equal(isOfflineVoice(v('en-us-x-sfg-local', 'en-US')), true);
});

test('picks 5 offline English voices, US first, enhanced first', () => {
  const voices = [
    v('fr-fr-x-frc-local', 'fr-FR'),
    v('en-gb-x-gba-local', 'en-GB'),
    v('en-us-x-tpd-network', 'en-US', 'Enhanced'),
    v('en-us-x-tpf-local', 'en-US'),
    v('en-us-x-sfg-local', 'en-US', 'Enhanced'),
    v('en-in-x-ena-local', 'en-IN'),
    v('en-au-x-aua-local', 'en-AU'),
    v('en-ng-x-ngb-local', 'en-NG'),
    v('en-us-x-sfg-local', 'en-US', 'Enhanced'), // duplicate
  ];
  assert.deepEqual(
    pickVoices(voices).map((x) => x.identifier),
    ['en-us-x-sfg-local', 'en-us-x-tpf-local', 'en-gb-x-gba-local', 'en-au-x-aua-local', 'en-in-x-ena-local'],
  );
});

test('fewer voices than 5 gives what there is; no English falls back to any offline voice', () => {
  assert.equal(pickVoices([v('en-us-x-a-local', 'en-US'), v('en-us-x-b-local', 'en-US')]).length, 2);
  assert.deepEqual(
    pickVoices([v('fr-fr-x-frc-local', 'fr-FR'), v('fr-fr-x-frd-network', 'fr-FR')]).map((x) => x.identifier),
    ['fr-fr-x-frc-local'],
  );
});

test('voice options are labelled by language and numbered; none means the phone default', () => {
  const opts = voiceOptions([v('en-us-x-a-local', 'en-US'), v('en-us-x-b-local', 'en-US'), v('en-gb-x-c-local', 'en-GB')]);
  assert.deepEqual(
    opts.map((o) => o.label),
    ['English (US) 1', 'English (US) 2', 'English (GB) 1'],
  );
  assert.equal(opts[0].id, 'en-us-x-a-local');
  assert.equal(opts[0].language, 'en-US');
  assert.deepEqual(voiceOptions([]), [DEFAULT_VOICE]);
  assert.deepEqual(voiceOptions([v('en-us-x-sfg-network', 'en-US')]), [DEFAULT_VOICE]);
  assert.equal(languageLabel('sw'), 'Swahili');
  assert.equal(languageLabel('xx-YY'), 'xx (YY)');
});

const pieces = (t: string, max?: number) => splitSentences(t, max).map((p) => p.text);

test('paragraphs are read a sentence at a time', () => {
  assert.deepEqual(pieces('The door opened. Nobody was there! Was it the wind?'), [
    'The door opened.',
    'Nobody was there!',
    'Was it the wind?',
  ]);
  // Closing quotes stay with their sentence.
  assert.deepEqual(pieces('"Run!" she shouted. “Now.” He ran.'), ['"Run!" she shouted.', '“Now.” He ran.']);
});

test('abbreviations, initials and very short sentences do not split', () => {
  assert.deepEqual(pieces('Mr. Smith met Dr. Lee at St. Mary. They talked.'), ['Mr. Smith met Dr. Lee at St. Mary.', 'They talked.']);
  assert.deepEqual(pieces('J. R. Hart arrived. Late again.'), ['J. R. Hart arrived.', 'Late again.']);
  assert.deepEqual(pieces('Oh. I see what you mean.'), ['Oh. I see what you mean.']);
  assert.deepEqual(pieces('No ending punctuation'), ['No ending punctuation']);
});

test('a very long sentence is read a phrase at a time', () => {
  const long = Array.from({ length: 12 }, (_, i) => `the ${i}th thing he remembered about that long summer`).join(', ') + '.';
  const out = splitSentences(long, 120);
  assert.ok(out.length > 1);
  for (const p of out) {
    assert.ok(p.text.length <= 120);
    assert.equal(long.slice(p.start, p.start + p.text.length), p.text);
  }
  assert.ok(out.slice(0, -1).every((p) => p.text.endsWith(',')), 'cut at commas');
});

test('chunk ranges point at their sentence in the paragraph', () => {
  const para = 'First one here.   Second one here.';
  const chunks = toChunks([para]);
  assert.equal(chunks.length, 2);
  for (const c of chunks) assert.equal(para.slice(c.start, c.end), c.text);
  assert.equal(chunks[1].start, 18);
});
