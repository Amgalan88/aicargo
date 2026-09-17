# PDF фонтууд

Гэрээний PDF (`lib/contract-pdf.tsx`) үүсгэхэд ашиглана. Бүгд SIL Open Font License 1.1.

| Файл | Эх сурвалж |
|---|---|
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | https://github.com/notofonts/notofonts.github.io (fonts/NotoSans/hinted/ttf) — кирилл, латин |
| `NotoSansSC-Regular.otf`, `NotoSansSC-Bold.otf` | https://github.com/notofonts/noto-cjk (Sans/SubsetOTF/SC) — хятад |

Хятад фонтын variable хувилбар (`NotoSansSC[wght].ttf`) react-pdf дээр Thin жинтэй гарах тул static OTF-ийг ашиглана.
Файлуудыг `next.config.ts`-ийн `outputFileTracingIncludes`-ээр PDF route-уудад хавсаргана.
