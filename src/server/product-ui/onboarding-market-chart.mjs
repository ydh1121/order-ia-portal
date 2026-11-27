import {marketPriceIcon} from './market-price-icon.mjs';

export function onboardingMarketChartSource(source) {
  const icon = /const marketNoticeIcon = '<svg[^\n]*?<\/svg>';/;
  const previous = "{id:'market-price',label:'시세 알림',icon:marketNoticeIcon,run:()=>brandMenu.open('notifications')}";
  if (!icon.test(source) || source.split(previous).length !== 2) throw Error('ONBOARDING_MARKET_CHART_SOURCE_CHANGED');
  const current = `{id:'market-price',label:'계란 시세',icon:marketNoticeIcon,run:()=>w.ORDER_OPEN_EGG_MARKET({
          root,trigger:quick,readChart:api.readMarketChart,signal:ctl.signal,onNotifications:()=>brandMenu.open('notifications')
        })}`;
  return source.replace(icon,()=> 'const marketNoticeIcon = '+JSON.stringify(marketPriceIcon)+';').replace(previous,()=>current);
}
