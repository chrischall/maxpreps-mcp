# Changelog

## [1.1.4](https://github.com/chrischall/maxpreps-mcp/compare/v1.1.3...v1.1.4) (2026-09-26)


### Bug Fixes

* **deps:** bump the production-dependencies group with 2 updates ([#76](https://github.com/chrischall/maxpreps-mcp/issues/76)) ([57c50ea](https://github.com/chrischall/maxpreps-mcp/commit/57c50eafec6fb95d2f8f8e31b02fbf757c0ef963))

## [1.1.3](https://github.com/chrischall/maxpreps-mcp/compare/v1.1.2...v1.1.3) (2026-09-24)


### Bug Fixes

* **deps:** bump dotenv in the production-majors group ([#72](https://github.com/chrischall/maxpreps-mcp/issues/72)) ([4b891dc](https://github.com/chrischall/maxpreps-mcp/commit/4b891dc5e7c4d8a397a211e572248e354137a2fb))
* **privacy:** project roster rows returned by maxpreps_get_page ([#74](https://github.com/chrischall/maxpreps-mcp/issues/74)) ([72493fd](https://github.com/chrischall/maxpreps-mcp/commit/72493fdb108f93ebd97cd7ee1f5c2326aea0e8b8))

## [1.1.2](https://github.com/chrischall/maxpreps-mcp/compare/v1.1.1...v1.1.2) (2026-09-23)


### Bug Fixes

* **schedule:** report neutral-site games as 'neutral', not 'away' ([#66](https://github.com/chrischall/maxpreps-mcp/issues/66)) ([2088f7d](https://github.com/chrischall/maxpreps-mcp/commit/2088f7dcac96dfe08c5dc568f8c36b591592bf39))
* **skill:** report a non-numeric homeAwayType as 'unknown' in the mpx schedule decoder ([#69](https://github.com/chrischall/maxpreps-mcp/issues/69)) ([7542762](https://github.com/chrischall/maxpreps-mcp/commit/7542762c59c74cbff95f6841a941bef3eef2e0d9))

## [1.1.1](https://github.com/chrischall/maxpreps-mcp/compare/v1.1.0...v1.1.1) (2026-09-23)


### Bug Fixes

* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#65](https://github.com/chrischall/maxpreps-mcp/issues/65)) ([9a482ac](https://github.com/chrischall/maxpreps-mcp/commit/9a482ac6272bb94694d0ac010c914db9826e3bd8)), closes [#63](https://github.com/chrischall/maxpreps-mcp/issues/63)
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#62](https://github.com/chrischall/maxpreps-mcp/issues/62)) ([55fd81f](https://github.com/chrischall/maxpreps-mcp/commit/55fd81fe0471fa9a56f47f6bb8962d91d87cb154))

## [1.1.0](https://github.com/chrischall/maxpreps-mcp/compare/v1.0.0...v1.1.0) (2026-09-19)


### Features

* **deps:** take mcp-utils 1.0.0 for the 2026-era stdio entry ([#60](https://github.com/chrischall/maxpreps-mcp/issues/60)) ([8385d9e](https://github.com/chrischall/maxpreps-mcp/commit/8385d9ee90da9aecea7525dc6760377a7a871948))

## [1.0.0](https://github.com/chrischall/maxpreps-mcp/compare/v0.3.1...v1.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#53](https://github.com/chrischall/maxpreps-mcp/issues/53))

### Features

* **mcp:** migrate server to SDK v2 ([#53](https://github.com/chrischall/maxpreps-mcp/issues/53)) ([e2454a9](https://github.com/chrischall/maxpreps-mcp/commit/e2454a9aed80d044d146fe62a3d091c900c31c67))

## [0.3.1](https://github.com/chrischall/maxpreps-mcp/compare/v0.3.0...v0.3.1) (2026-09-10)


### Bug Fixes

* **deps:** @chrischall/mcp-utils 0.26.1 ([#48](https://github.com/chrischall/maxpreps-mcp/issues/48)) ([9bcd9fe](https://github.com/chrischall/maxpreps-mcp/commit/9bcd9fe7d1ea4d04f8f834d9c6120c3b6e79d9a1))
* **deps:** bump hono from 4.13.0 to 4.13.7 ([#46](https://github.com/chrischall/maxpreps-mcp/issues/46)) ([30f5525](https://github.com/chrischall/maxpreps-mcp/commit/30f5525bd068a99e9a624156b42aadf77ea547c7))
* **deps:** declare the peer floors mcp-utils 0.26.1 requires ([#50](https://github.com/chrischall/maxpreps-mcp/issues/50)) ([d493559](https://github.com/chrischall/maxpreps-mcp/commit/d49355970197a5d317f409e903c598ee9b7dcf83)), closes [#49](https://github.com/chrischall/maxpreps-mcp/issues/49)

## [0.3.0](https://github.com/chrischall/maxpreps-mcp/compare/v0.2.0...v0.3.0) (2026-09-04)


### Features

* **tools:** minify every response — no formatting whitespace on any payload ([#36](https://github.com/chrischall/maxpreps-mcp/issues/36)) ([61c2845](https://github.com/chrischall/maxpreps-mcp/commit/61c284548f8faf57bca01c48670b83fb3068a9ee))


### Bug Fixes

* **build:** restore the literal em dash in the package description ([#38](https://github.com/chrischall/maxpreps-mcp/issues/38)) ([7f09e44](https://github.com/chrischall/maxpreps-mcp/commit/7f09e44623de47c369f02578735c350f45129b5f))


### Refactor

* **tools:** drop the unwired view.ts scaffold ([#39](https://github.com/chrischall/maxpreps-mcp/issues/39)) ([9ad9d5f](https://github.com/chrischall/maxpreps-mcp/commit/9ad9d5f8b72896ea211fd3218c1fafea0727e9ca))


### Documentation

* **mint:** declare MAXPREPS_TIMEOUT_MS in mint.yaml ([#26](https://github.com/chrischall/maxpreps-mcp/issues/26)) ([4d93bc9](https://github.com/chrischall/maxpreps-mcp/commit/4d93bc905449ae17ccb6fa5314b9575ac0b2c9e9))
* **mint:** name the MAXPREPS_TIMEOUT_MS default ([#29](https://github.com/chrischall/maxpreps-mcp/issues/29)) ([106ae98](https://github.com/chrischall/maxpreps-mcp/commit/106ae98c682091334ff2616eecd320ed789bf37c)), closes [#27](https://github.com/chrischall/maxpreps-mcp/issues/27)

## [0.2.0](https://github.com/chrischall/maxpreps-mcp/compare/v0.1.0...v0.2.0) (2026-08-01)


### Features

* add rankings and conference standings tools ([#2](https://github.com/chrischall/maxpreps-mcp/issues/2)) ([7c2de28](https://github.com/chrischall/maxpreps-mcp/commit/7c2de28dfaea7141498de0e9ead4fd9e5e7f0d5b))
* add stat leaderboards, tournaments, and fix rankings paging ([#5](https://github.com/chrischall/maxpreps-mcp/issues/5)) ([4d5f3ab](https://github.com/chrischall/maxpreps-mcp/commit/4d5f3aba9eafb6f93f3ac98db88f3396927c535e)), closes [#3](https://github.com/chrischall/maxpreps-mcp/issues/3)


### Bug Fixes

* correct the empty-leaderboard note and cover rankings traversal ([#9](https://github.com/chrischall/maxpreps-mcp/issues/9)) ([1f14aac](https://github.com/chrischall/maxpreps-mcp/commit/1f14aac15e48ae061e4c85f9a64f3241b5bfb267)), closes [#8](https://github.com/chrischall/maxpreps-mcp/issues/8)
* validate state codes and correct rankings paging edges ([#7](https://github.com/chrischall/maxpreps-mcp/issues/7)) ([32ad7c3](https://github.com/chrischall/maxpreps-mcp/commit/32ad7c30466c45f4d3936380fc0832b19f0cfec8)), closes [#6](https://github.com/chrischall/maxpreps-mcp/issues/6)

## 0.1.0 (2026-08-01)


### Features

* MaxPreps MCP server for high school sports data ([2bbe9e1](https://github.com/chrischall/maxpreps-mcp/commit/2bbe9e14d8d15617e92cf84a50c5f35dbf3f1268))
