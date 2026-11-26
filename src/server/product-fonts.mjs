// Unmodified official Pretendard Variable webfont. Both aliases retain existing
// product CSS while the same bytes are used in QA and native renderer checks.
export const productFontUrl='/vendor/fonts/pretendard-variable-9599f12fd42f.woff2';
export const productFontSha256='9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4';
export const productFontCss=['Pretendard','Pretendard Variable'].map(family=>`@font-face{font-family:"${family}";src:url("${productFontUrl}") format("woff2");font-weight:45 920;font-style:normal;font-display:swap}`).join('\n');
