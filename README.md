# Eternum loader

Eternum loader is an app that uses a local Torii instance to download Eternum's data onto your local machine.

## Install and config

### Easy way

The easiest way to install is via the settings directly in [the game](https://eternum.realms.world).

There's no configuration, simply launch the app and select the chain you want to sync.

### Manual way

`npm i && npm start`

## Updating

This app supports auto-updating. This means the user only needs to download the Eternum Loader once and will be prompted to update everytime a new release is up. To release a new version of the app, change the version in the [`package.json`](./package.json) file and then run the manual CI action `release`, this will create a draft release, you just need to publish the release on Github and that's it!

## Important notice

To work correctly this app pulls the following files from the Github repo from the `next` branch. That requires that the
maintainers of this repository update the following files and that these files - either stay at the same place or that
the contents of [torii.ts](src/utils/torii.ts) be updated:

- [Scarb.toml](../../../contracts/game/Scarb.toml): this is used to determine what version of Torii the Eternum Loader
  should used.
- [torii-\<chain\>.toml](../../../contracts/game/torii-mainnet.toml): these files are given to Torii when launching the
  app and when changing configuration mainly to ensure that: the `rpc` is correct, the `world_address` is correct, the
  `world_block` is correct. But overall it uses this file to ensure that the configuration used is the best one (sql
  indices, etc.).
