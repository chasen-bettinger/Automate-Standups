const { IncomingWebhook } = require("@slack/webhook");

export const slack = () => {
  const webhook = new IncomingWebhook(process.env.webhookUrl);
  return {
    send: async (text) => {
      try {
        await webhook.send({ text });
      } catch (e) {
        console.error(`SLACK FAILED TO SEND`, { e });
        return false;
      }
    },
  };
};
