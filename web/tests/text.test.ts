import { expect, test } from 'vitest'
import { continueBullet, linkify, singleLine } from '../src/lib/text'

test('linkify keeps markup as text and only links http(s)', () => {
  expect(linkify('<img src=x onerror=alert(1)> see https://x.sharepoint.com/a?b=1. javascript:alert(1)')).toEqual([
    { kind: 'text', text: '<img src=x onerror=alert(1)> see ' },
    { kind: 'link', text: 'https://x.sharepoint.com/a?b=1', href: 'https://x.sharepoint.com/a?b=1' },
    { kind: 'text', text: '. javascript:alert(1)' },
  ])
})

test.each([',', ';', ':', ')', '!', '?', '.', '?!'])('linkify strips trailing %s', (p) => {
  expect(linkify(`go http://a.com/x${p} ok`)).toEqual([
    { kind: 'text', text: 'go ' },
    { kind: 'link', text: 'http://a.com/x', href: 'http://a.com/x' },
    { kind: 'text', text: `${p} ok` },
  ])
})

test('linkify with no links is one text segment, and empty gives none', () => {
  expect(linkify('plain')).toEqual([{ kind: 'text', text: 'plain' }])
  expect(linkify('')).toEqual([])
})

test('continueBullet continues, and ends list on empty bullet', () => {
  expect(continueBullet('- one', 5)).toEqual({ value: '- one\n- ', caret: 8 })
  expect(continueBullet('- one\n- ', 8)).toEqual({ value: '- one\n', caret: 6 })
  expect(continueBullet('plain', 5)).toBeNull()
})

test('continueBullet supports * bullets and keeps the character', () => {
  expect(continueBullet('* one', 5)).toEqual({ value: '* one\n* ', caret: 8 })
  expect(continueBullet('* one\n* ', 8)).toEqual({ value: '* one\n', caret: 6 })
})

test('continueBullet only acts at the end of a bullet line', () => {
  expect(continueBullet('- one\nplain', 5 + 6)).toBeNull()
  expect(continueBullet('- one two', 5)).toBeNull()
})

test('continueBullet works on a middle line when the caret is at its end', () => {
  expect(continueBullet('- a\n- b\nz', 7)).toEqual({ value: '- a\n- b\n- \nz', caret: 10 })
})

test('singleLine collapses newlines', () => expect(singleLine(' a\r\n b \t c ')).toBe('a b c'))
