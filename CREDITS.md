# Credits

## Maps

`apps/client/public/maps/` is a git submodule pinned to
[the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps).
SVG maps of Escape from Tarkov locations contributed by the
[tarkov.dev](https://tarkov.dev) community.

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
See [`apps/client/public/maps/LICENSE.md`](apps/client/public/maps/LICENSE.md)
for the full text and the explicit no-cheating clause.

`RaidMate` is a personal, non-commercial tool — the NC clause is
satisfied. Should this repo ever be open-sourced, the SVG maps remain
under their original CC BY-NC-SA 4.0 license; the submodule keeps them
separate from this project's code so the two licenses don't entangle.

## Map calibration

Per-map affine transform values (scale, offset, rotation) used to project
in-game `(x, z)` coordinates onto the SVG were taken from the
[the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev)
frontend (MIT-licensed), specifically `src/data/maps.json` and the
custom-CRS construction in `src/pages/map/index.jsx`. They are the
single source of truth for `transform` / `coordinateRotation` /
`bounds` per map.

## Game data API

Live extract / spawn / loot data comes from the public GraphQL endpoint
at <https://api.tarkov.dev/graphql>. Maintained by the same community,
no authentication required.
