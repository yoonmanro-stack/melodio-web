/**
 * Melodio — 2단계 장르 구조 (Primary → Sub-genre)
 * DistroKid Primary/Secondary 장르 매핑 호환
 * Tag level: 1=핵심, 2=일반, 3=세부
 */

import type { GenreCategory } from '@/types'

export const genreCategory: GenreCategory = {
  id: 'genre',
  number: 1,
  icon: '🎸',
  title: '장르 선택',
  desc: '음악의 색깔',
  placeholder: '장르를 직접 입력하세요',
  subGenres: [
    {
      id: 'lofi',
      label: 'Lo-fi',
      tags: [
        { label: 'Lo-fi Hip-Hop', value: 'Lo-fi Hip-Hop', level: 1 },
        { label: 'Lo-fi Jazz', value: 'Lo-fi Jazz', level: 1 },
        { label: 'Chillhop', value: 'Chillhop', level: 2 },
        { label: 'Lo-fi Pop', value: 'Lo-fi Pop', level: 2 },
        { label: 'Lo-fi R&B', value: 'Lo-fi R&B', level: 3 },
      ],
    },
    {
      id: 'jazz',
      label: 'Jazz',
      tags: [
        { label: 'Smooth Jazz', value: 'Smooth Jazz', level: 1 },
        { label: 'Jazz Fusion', value: 'Jazz Fusion', level: 2 },
        { label: 'Bossa Nova', value: 'Bossa Nova', level: 2 },
        { label: 'Swing Jazz', value: 'Swing Jazz', level: 2 },
        { label: 'Bebop', value: 'Bebop', level: 3 },
        { label: 'Jazz Funk', value: 'Jazz Funk', level: 3 },
        { label: 'Cool Jazz', value: 'Cool Jazz', level: 3 },
      ],
    },
    {
      id: 'kpop',
      label: 'K-Pop',
      tags: [
        { label: 'K-Pop Idol', value: 'K-Pop', level: 1 },
        { label: 'K-Pop Ballad', value: 'K-Pop Ballad', level: 1 },
        { label: 'K-Hip-Hop', value: 'Korean Hip-Hop', level: 2 },
        { label: 'K-R&B', value: 'Korean R&B', level: 2 },
        { label: 'K-Indie', value: 'Korean Indie', level: 3 },
      ],
    },
    {
      id: 'pop',
      label: 'Pop',
      tags: [
        { label: 'Pop', value: 'Pop', level: 1 },
        { label: 'Indie Pop', value: 'Indie Pop', level: 1 },
        { label: 'City Pop', value: 'City Pop', level: 2 },
        { label: 'Dream Pop', value: 'Dream Pop', level: 2 },
        { label: 'Electropop', value: 'Electropop', level: 2 },
        { label: 'Synth-Pop', value: 'Synth-Pop', level: 3 },
      ],
    },
    {
      id: 'rnb',
      label: 'R&B / Soul',
      tags: [
        { label: 'R&B', value: 'R&B', level: 1 },
        { label: 'Neo Soul', value: 'Neo Soul', level: 1 },
        { label: 'Funk', value: 'Funk', level: 2 },
        { label: 'Gospel', value: 'Gospel', level: 3 },
        { label: 'Contemporary R&B', value: 'Contemporary R&B', level: 3 },
      ],
    },
    {
      id: 'hiphop',
      label: 'Hip-Hop',
      tags: [
        { label: 'Hip-Hop', value: 'Hip-Hop', level: 1 },
        { label: 'Trap', value: 'Trap', level: 1 },
        { label: 'Phonk', value: 'Phonk', level: 2 },
        { label: 'Cloud Rap', value: 'Cloud Rap', level: 2 },
        { label: 'Boom Bap', value: 'Boom Bap', level: 3 },
        { label: 'Drill', value: 'Drill', level: 3 },
      ],
    },
    {
      id: 'edm',
      label: 'EDM',
      tags: [
        { label: 'House', value: 'House', level: 1 },
        { label: 'Techno', value: 'Techno', level: 1 },
        { label: 'EDM', value: 'EDM', level: 1 },
        { label: 'Trance', value: 'Trance', level: 2 },
        { label: 'Drum & Bass', value: 'Drum and Bass', level: 2 },
        { label: 'Future Bass', value: 'Future Bass', level: 2 },
        { label: 'Dubstep', value: 'Dubstep', level: 3 },
        { label: 'Big Room', value: 'Big Room House', level: 3 },
      ],
    },
    {
      id: 'rock',
      label: 'Rock',
      tags: [
        { label: 'Rock', value: 'Rock', level: 1 },
        { label: 'Indie Rock', value: 'Indie Rock', level: 1 },
        { label: 'Acoustic Rock', value: 'Acoustic Rock', level: 2 },
        { label: 'Pop Rock', value: 'Pop Rock', level: 2 },
        { label: 'Metal', value: 'Metal', level: 2 },
        { label: 'Hard Rock', value: 'Hard Rock', level: 3 },
        { label: 'Blues Rock', value: 'Blues Rock', level: 3 },
      ],
    },
    {
      id: 'classical',
      label: 'Classical',
      tags: [
        { label: 'Classical', value: 'Classical', level: 1 },
        { label: 'Cinematic / Orchestral', value: 'Cinematic Orchestral', level: 1 },
        { label: 'Piano Solo', value: 'Piano Solo', level: 2 },
        { label: 'Epic Orchestral', value: 'Epic Orchestral', level: 2 },
        { label: 'Ambient Classical', value: 'Ambient Classical', level: 3 },
      ],
    },
    {
      id: 'ambient',
      label: 'Ambient',
      tags: [
        { label: 'Ambient', value: 'Ambient', level: 1 },
        { label: 'Synthwave', value: 'Synthwave', level: 1 },
        { label: 'Dark Ambient', value: 'Dark Ambient', level: 2 },
        { label: 'Nature Ambient', value: 'Nature Ambient', level: 2 },
        { label: 'Meditation', value: 'Meditation Music', level: 2 },
        { label: 'Sleep Music', value: 'Sleep Music', level: 3 },
      ],
    },
    {
      id: 'folk',
      label: 'Folk / Acoustic',
      tags: [
        { label: 'Folk', value: 'Folk', level: 1 },
        { label: 'Acoustic', value: 'Acoustic', level: 1 },
        { label: 'Country', value: 'Country', level: 2 },
        { label: 'Singer-Songwriter', value: 'Singer-Songwriter', level: 2 },
        { label: 'Bluegrass', value: 'Bluegrass', level: 3 },
      ],
    },
    {
      id: 'world',
      label: '월드뮤직 / 기타',
      tags: [
        { label: '레게 (Reggae)', value: 'Reggae', level: 2 },
        { label: '라틴 (Latin)', value: 'Latin', level: 2 },
        { label: '월드뮤직', value: 'World Music', level: 2 },
        { label: '블루스 (Blues)', value: 'Blues', level: 2 },
        { label: '디스코 (Disco)', value: 'Disco', level: 3 },
        { label: 'CCM / 찬양', value: 'CCM, Praise', level: 3 },
        { label: '뮤지컬 (Musical)', value: 'Musical', level: 3 },
      ],
    },
  ],
}

/** DistroKid 장르 매핑 테이블 */
export const distrokidGenreMap: Record<string, string> = {
  'Lo-fi Hip-Hop': 'Hip-Hop/Rap',
  'Lo-fi Jazz': 'Jazz',
  'Chillhop': 'Hip-Hop/Rap',
  'Smooth Jazz': 'Jazz',
  'Jazz Fusion': 'Jazz',
  'Bossa Nova': 'Jazz',
  'K-Pop': 'Pop',
  'K-Pop Ballad': 'Pop',
  'Korean Hip-Hop': 'Hip-Hop/Rap',
  'Pop': 'Pop',
  'City Pop': 'Pop',
  'Indie Pop': 'Pop',
  'R&B': 'R&B/Soul',
  'Neo Soul': 'R&B/Soul',
  'Funk': 'R&B/Soul',
  'Gospel': 'Gospel & Religious',
  'Hip-Hop': 'Hip-Hop/Rap',
  'Trap': 'Hip-Hop/Rap',
  'House': 'Dance/Electronic',
  'Techno': 'Dance/Electronic',
  'EDM': 'Dance/Electronic',
  'Rock': 'Rock',
  'Metal': 'Metal',
  'Classical': 'Classical',
  'Cinematic Orchestral': 'Soundtrack',
  'Ambient': 'New Age',
  'Meditation Music': 'New Age',
  'Folk': 'Folk',
  'Country': 'Country',
  'Reggae': 'Reggae',
  'Latin': 'Latin',
  'Blues': 'Blues',
}
