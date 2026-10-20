import { readStored, writeStored } from './storage.js';

// Which level this page load plays. Chosen on the title screen; switching reloads the page (as restart does),
// because the world is built once at load and every module reads it.
export const LEVELS = {
  castle: {
    name: 'Dawnhold', place: 'The River Keep', crest: 'A Siege at First Light',
    tagline: 'Fifteen warbands march on the river keep. Hold the gate until the last banner falls.',
    won: 'The last banner lies in the mud. Dawnhold stands, and the river runs quiet once more.',
  },
  frostmere: {
    name: 'Frostmere', place: 'The Winter Pass', crest: 'A Siege at the Roof of the World',
    tagline: 'The pass fort is the last wall before the lowlands. Hold it against fifteen hosts out of the snow.',
    won: 'The last war-horn dies on the wind. Frostmere holds, and the pass is sealed until the thaw.',
  },
  saltreach: {
    name: 'Saltreach', place: 'The Sunset Coast', crest: 'A Siege at the Edge of the Sea',
    tagline: 'Longships on the beach, a column on the cliff road, a host on the causeway. Three roads, one gate.',
    won: 'The tide takes the last longship. Saltreach stands, and its beacon burns on into the night.',
  },
};
const asked = new URLSearchParams(location.search).get('level') || readStored('sessionStorage', 'cd-level');
export const LEVEL = Object.hasOwn(LEVELS, asked) ? asked : 'castle';
export const levelInfo = LEVELS[LEVEL];
export function switchLevel(id, then = null) {
  if (!Object.hasOwn(LEVELS, id)) return;
  writeStored('sessionStorage', 'cd-level', id);
  const url = new URL(location.href);
  url.searchParams.set('level', id);
  if (then) url.searchParams.set('start', then); else url.searchParams.delete('start');
  location.replace(url);
}
