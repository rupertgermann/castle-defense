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
const asked = new URLSearchParams(location.search).get('level') || sessionStorage.getItem('cd-level');
export const LEVEL = asked in LEVELS ? asked : 'castle';
export const levelInfo = LEVELS[LEVEL];
// Reload without any ?level= so the stored choice wins.
export function switchLevel(id, then = null) { if (id === LEVEL || !(id in LEVELS)) return; sessionStorage.setItem('cd-level', id); if (then) sessionStorage.setItem('cd-restart', then); location.replace(location.pathname); }
