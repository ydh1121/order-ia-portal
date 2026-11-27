// One monochrome glyph for the customer button and both icon catalogues.
// The open lower-right shell leaves room for the rising price line at 22px.
export const marketPriceIcon = '<svg xmlns="http://www.w3.org/2000/svg" class="ob-market-notice-icon" aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'
  + '<path data-shape="egg" d="M9.7 21C5 21 2.1 18.1 2.1 14.1C2.1 9.3 5.9 2 10.3 2C13.9 2 17.3 7.1 18.2 11.5"/>'
  + '<path data-currency="KRW" stroke-width="1.2" d="M5.2 8.2L7.5 15.8L10 9.5L12.4 15.8L14.7 8.2M4.9 10.8H14.9M5.8 13.4H14"/>'
  + '<path data-shape="price-trend" d="M12 20.6L15.5 16.8L17.9 18.6L21.8 13.2"/>'
  + '</svg>';

export const marketPriceIconPreview = '<span style="display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;color:#fff;background:#20272b">' + marketPriceIcon + '</span>';

export function marketPriceIconAsset(catalog) {
  const usages = catalog.filter(row => row.screen === 'onboarding' && /^member-[1-4]$/.test(row.state));
  return {id:'market-price', name:'계란 시세', usages, variants:[{
    uses:usages.map(row => ({id:row.id, controlLabel:'계란 시세'}))
  }]};
}
