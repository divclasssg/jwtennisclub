# IBM Plex Sans KR asset provenance

`IBMPlexSansKR-Regular.ttf` is the unmodified static TrueType regular face
from the official [IBM Plex](https://github.com/IBM/plex) family. Its internal
font metadata identifies version `1.001;2020`, copyright IBM Corp. (2018),
and SIL Open Font License 1.1.

The complete static source was selected because the official Google Noto Sans
KR variable font and a generated static derivative both rendered no Korean
glyph outlines in this `@react-pdf/renderer` path. This static `glyf` TrueType
font renders the verified Korean glyph outlines correctly.

The bundled asset SHA-256 is:

`3fe6897f311fa4355a934716e308e1c206e00114cdbc3a51d1e7fa93e3490243`

It is bundled for server-side `@react-pdf/renderer` output and is licensed
under the SIL Open Font License 1.1 in [LICENSE](./LICENSE).
