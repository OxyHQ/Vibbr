/**
 * Stickers from Oxy's shared catalogue (`@oxy.so/stickers`), drawn by Bloom's `Sticker` above an
 * empty state. The client is built once at the root from the app's `OxyServices`; this module
 * only names the stickers Vibbr uses, so changing one screen's sticker is one line here.
 *
 * Each value is a catalogue id: the art can be redrawn in Oxy without a Vibbr release, and a
 * published sticker never stops resolving. The emoji and pack in each comment are what the
 * sticker is, for whoever reads this without the catalogue open.
 *
 * Errors keep a calm character on purpose, and settings pages keep their icon: a cartoon
 * reacting to a failure must not read as an alarm.
 */

/** 🤷 blob-blah-blah (shrugging) */
const BLOB_SHRUGGING = '01a0eada-9343-7430-8062-8424ea19b842';
/** 👀 blob-blah-blah (watching) */
const BLOB_WATCHING = '01a0eada-9cc9-7d48-98e1-d6ef59830aa7';
/** 😅 blob-blah-blah (oops) */
const BLOB_OOPS = '01a0eada-959f-721f-92e0-3ddfa8ae8e27';
/** 🥳 fearless-bird (partytime) */
const BIRD_PARTYTIME = '01a0eadb-3895-7264-97c4-f7aaf2d722ef';
/** 💻 escape-from-reality (laptop) */
const ESCAPE_LAPTOP = '01a0eadb-07c7-7315-94aa-6d8639943c21';
/** 👋 introvert-life (wave) */
const INTROVERT_WAVE = '01a0eadb-5dd8-70d1-b12b-5083a0c5b01a';

export const EMPTY_STATE_STICKERS = {
  // Discover and search
  discoverEmpty: BLOB_SHRUGGING,
  searchIdle: BLOB_WATCHING,
  searchNoResults: BLOB_SHRUGGING,

  // Tickets and organizing
  ticketsEmpty: BIRD_PARTYTIME,
  organizeEmpty: ESCAPE_LAPTOP,

  // Signed out, and a page that is not there
  signIn: INTROVERT_WAVE,
  notFound: BLOB_OOPS,

  // Something went wrong: every error state gets one, by default.
  /** 😵‍💫 school-days (dizzy) — could not load, something went wrong. */
  loadError: '01a0eadb-a89b-7b15-b07e-779c938c26c3',
} as const;

export type EmptyStateStickerName = keyof typeof EMPTY_STATE_STICKERS;
