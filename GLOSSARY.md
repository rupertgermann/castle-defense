# Castle Defense

A tower-defense game: the player raises towers beside the roads to stop waves of foes reaching the keep's gate, across three levels.

## Language

### The siege

**Siege**:
One playthrough of one level at one difficulty, from the first build phase to victory or defeat.
_Avoid_: game, run, match, session

**Level**:
One of the battlefields a siege is fought on (Dawnhold, Frostmere, Saltreach), with its own roads and waves.
_Avoid_: map, stage, world (world is the 3D scene a level is drawn in)

**Difficulty**:
The rank a siege is fought at (Squire, Knight, Lord), setting starting gold, keep strength and foe toughness.
_Avoid_: mode, setting

**Wave**:
One numbered host of foes sent along the roads; a level has a fixed sequence of them.
_Avoid_: round, level

**Build phase**:
The pause between waves when the player builds, with a countdown until the next wave marches.
_Avoid_: break, intermission

**Horn**:
Calling the next wave before the countdown ends, rewarded with bonus gold for the time left.
_Avoid_: early call, skip

**Leak**:
A foe reaching the gate; it costs keep strength.
_Avoid_: breach (the UI's word for the on-screen flash), escape

**Keep strength**:
How many leaks the keep can take before it falls; the siege is lost at zero.
_Avoid_: lives, health, hp

**Crowns**:
The 1–3 rating of a won siege, by how much keep strength is left.
_Avoid_: stars, score

### Economy

**Gold**:
The single currency, spent on building and upgrading towers.
_Avoid_: money, coins

**Bounty**:
Gold paid for slaying a foe.
_Avoid_: reward, loot

**Clear bonus**:
Gold paid for repelling a wave.
_Avoid_: wave reward

### Towers

**Tower**:
A war engine the player raises on a build site; it has a type and three levels, and can be upgraded or sold.
_Avoid_: turret, defence, building

**Build site**:
One of the fixed places beside the roads where a tower can stand, at most one tower each.
_Avoid_: pad, slot, plot

**Splash**:
Damage spread over every foe within a radius of where a shot lands, weaker toward the edge.
_Avoid_: AoE, area damage

**Fire pool**:
A patch of burning pitch left by a Pitch Cauldron shot that scorches every foe standing in it for a while; overlapping pools don't add up.
_Avoid_: burning, puddle, burn zone

**Dead zone**:
The ring around a Trebuchet too close for it to strike.
_Avoid_: min range, blind spot
