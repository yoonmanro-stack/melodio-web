/** Primary listening purpose for the reviewed public catalog; genre stays separate. */
export type PresetPurpose = 'healing' | 'focus' | 'retro' | 'cafe' | 'drive' | 'cinematic'

const purposeGroups: Record<PresetPurpose, readonly string[]> = {
  healing: [
    'slowcore', 'shoegaze', 'neoclassical_ambient', 'midwest_emo', 'korean_ballad',
    'indie_folk', 'folktronica', 'dream_pop', 'chillwave', 'chillstep', 'chill-phonk',
    'chamber_folk', 'bedroom_pop', 'ambient_pop', 'ambient_drone',
    'quiet-forest-acoustic-guitar', 'iced-oolong-tea', 'deep-sleep-drift', 'acoustic-folk-trot',
  ],
  focus: [
    'trip_hop', 'krautrock', 'lofi_hiphop', 'lofi-hiphop', 'idm_glitch', 'idm_electronic',
    'dub_reggae', 'deep_house', 'developer-debugging',
  ],
  retro: [
    'vaporwave', 'trot', 'traditional_trot', 'techno_trot', 'synthwave_retrowave',
    'synthwave', 'synthpop_new_wave', 'synth_pop_80s', 'synth_pop_1980s', 'ska_traditional',
    'ska_rocksteady', 'psychedelic_rock', 'new_jack_swing', 'mallsoft', 'jpop_1980s',
    'glam_metal', 'g_funk', 'future_funk', 'electroclash', 'dead-mall-nostalgia',
    'darkwave', 'classic_phonk', 'classic_motown', 'city_pop', 'chiptune', 'chicago_house',
    'baroque_pop', 'afrobeats_70s', 'acid_house', 'traditional-trot-master',
  ],
  cafe: [
    'yacht_rock', 'uk_jazz_modern', 'twee_pop', 'sophisti_pop', 'shibuya_kei', 'roots_reggae',
    'reggae_fusion', 'neo_soul', 'korean_rnb', 'k_indie', 'gypsy_jazz', 'flamenco',
    'electro_swing', 'country_pop', 'celtic_folk', 'bossa_nova', 'bluegrass',
    'authentic_samba', 'amapiano', 'alternative_rnb', 'afro_cuban_jazz', 'acid_jazz',
    'matcha-kyoto-jazz', 'french-vintage-chanson',
  ],
  cinematic: [
    'witch_house', 'visual_kei', 'symphonic_power_metal', 'symphonic_metal',
    'symphonic_black_metal', 'stoner_rock_sludge', 'stoner_rock', 'screamo_skramz',
    'progressive_rock', 'post_rock', 'nu_metal', 'noise_rock', 'neofolk_ritual',
    'melodic_hardcore', 'melodic_death_metal', 'mathcore', 'joseon_hiphop', 'joseon-hiphop',
    'j_rock_visual_kei', 'industrial_rock', 'industrial_metal', 'hardwave',
    'hardcore_punk', 'gugak_crossover', 'gothic_rock', 'gothic_metal', 'gothic_americana',
    'doom_metal', 'djent_metal', 'djent_math_metal', 'desert_rock', 'darksynth_cyberpunk',
    'darksynth', 'dark_folk_pagan', 'dark_ambient', 'dark_academia', 'blackgaze',
    'atmospheric_black_metal', 'art_pop', 'rock-ballad-for-one-true-love', 'joseon-hip-hop',
  ],
  drive: [
    'brazilian-funk-kpop-performance', 'wave_phonk', 'vocaloid_pop', 'uk_grime', 'uk_garage',
    'uk_funky', 'uk_drill', 'uk_bassline', 'trap_music', 'slap_house', 'skate_punk_pop',
    'ska_punk', 'sample_drill', 'salsa_dance', 'riddim_dubstep', 'reggaeton', 'rage_rap',
    'psytrance', 'progressive_house', 'post_punk_revival', 'post_punk', 'pop_punk',
    'pluggnb', 'original_dubstep', 'original_drill', 'original_afrobeat', 'nu_disco',
    'no_bounce', 'modern_afrobeats', 'memphis_phonk', 'melodic_techno', 'melodic_dubstep',
    'math_rock_midwest_emo', 'math_rock', 'liquid_dnb', 'kpop_girl_crush', 'kpop_dance',
    'kpop_bubblegum', 'kawaii_future_bass', 'jrock_anisong', 'jersey_club',
    'jamaican_dancehall', 'j_core', 'industrial_techno', 'hypertechno', 'hyperpop',
    'house_phonk', 'hardstyle', 'hard_techno_schranz', 'happy_hardcore', 'grunge_seattle',
    'grunge', 'grime', 'glitch_pop', 'glitch_hop', 'garage_rock_revival', 'garage_rock',
    'gabber_techno', 'gabba_hardcore', 'future_bass', 'french_house', 'eurodance', 'eurobeat',
    'euro_disco', 'emo_trap', 'emo_rap', 'east_coast_boom_bap', 'dubstep_og',
    'drum_and_bass', 'drift_phonk', 'dream-garage', 'digicore', 'detroit_techno',
    'dark_trap', 'dark_techno', 'dance_punk', 'complextro', 'cloud_rap', 'bubblegum_pop_kpop',
    'brostep', 'breakcore', 'brazilian_funk', 'boom_bap', 'bass_house', 'baile_funk',
    'atlanta_trap', 'alt_pop', 'afrobeats', 'afro_house', 'tokyo-midnight-1984', 'highway-disco-trot',
  ],
}

export const presetCatalogCategories: Readonly<Record<string, PresetPurpose>> = Object.freeze(
  Object.fromEntries(Object.entries(purposeGroups).flatMap(([purpose, keys]) =>
    keys.map(key => [key, purpose as PresetPurpose]),
  )),
)
