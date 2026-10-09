# Asset sources

Brand assets are the real AO Cyber Systems files, downloaded and cached here unchanged. They are never redrawn,
recoloured or replaced with a placeholder. To refresh one, download it again into an empty directory, compare the
sha256 with the line below, and update the line when the upstream file has changed.

| File | Source | Downloaded | sha256 |
|---|---|---|---|
| `ao-icon.svg` | https://aocyber.ai/images/ao-icon.svg | 2026-10-08 | `12f6c83e14bae0f19a07cf6585f0ffb6eda417bcc53b72159f5ffd7ce1765965` |

`ao-icon.svg` is the gold "AO" emblem, the AO Cyber web and UI mark (not the print lockup). Its viewBox is
900×969.69, so it is not square: size it by height and let the width follow. `site/static/ao-icon.svg` (the docs
site header and favicon) is the same file, byte for byte.

`terminal.svg` is terminal artwork inherited from the GSD fork baseline, not a brand asset.
