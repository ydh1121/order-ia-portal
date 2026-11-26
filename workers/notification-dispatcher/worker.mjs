import {processNotificationWork} from '../../src/server/notification-push.mjs';

// No public drain route. Pages writes and this cron use the same durable outbox
// and lease, so browser traffic is not required for effective dates or retries.
export default {
  async fetch(){return new Response('Not found',{status:404});},
  async scheduled(controller,env){
    if(!env.ORDER_QA_DB)throw Error('NOTIFICATION_DATABASE_REQUIRED');
    const result=await processNotificationWork(env);
    console.log(JSON.stringify({event:'notification-dispatch',scheduledTime:controller.scheduledTime,
      available:result.available,prices:result.prices,push:result.push}));
    return result;
  }
};
