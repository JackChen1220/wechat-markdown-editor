# Upstream integration contract

`gzh-design-skill` is the source of truth for this project's WeChat output
contract and built-in design themes.

## Precedence

When local behavior conflicts with the upstream repository, apply upstream in
this order:

1. `SKILL.md` platform red lines and workflow requirements;
2. `references/theme-index.md` theme identity, suitability, and underline CSS;
3. the selected `references/theme-*.md` component skeleton and semantic mapping;
4. `references/common-components.md` shared code, image, GIF, and callout rules;
5. `scripts/validate_gzh_html.py` deterministic output checks.

The current integration is pinned to:

```text
https://github.com/isjiamu/gzh-design-skill
ba1f4175519b481cb3566616c9e5178705067904
```

## Sync procedure

1. Review upstream changes to `SKILL.md`, `theme-index.md`, all six registered
   theme libraries, common components, and the validator.
2. Update the theme registry and canonical renderer together.
3. Update `scripts/validate_gzh_html.py` when the upstream validator changes.
4. Run the JavaScript renderer tests.
5. Generate fixtures for every theme and run the Python validator on each.
6. Verify preview, copy, and exported HTML are byte-for-byte based on the same
   canonical body fragment.

Local UI CSS may use normal browser features. Only the generated WeChat body
fragment is subject to the upstream platform red lines.

The eight `original-classic` color themes are local compatibility themes
restored from this repository's pre-integration editor. They may keep their
original palette and component identity, but their generated HTML must still
pass the upstream platform red lines and deterministic validator. The six
upstream themes retain their own authoritative skeletons and colors.
