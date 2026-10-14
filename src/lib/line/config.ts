export function lineConfig() {
  return {
    channelSecret: process.env.LINE_CHANNEL_SECRET ?? "",
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
    ownerUserId: process.env.LINE_OWNER_USER_ID ?? "",
    // Overridable so tests can point the bot at a local mock of the LINE API.
    apiBase: process.env.LINE_API_BASE ?? "https://api.line.me",
    dataApiBase: process.env.LINE_DATA_API_BASE ?? "https://api-data.line.me",
  };
}

export function isLineConfigured() {
  const c = lineConfig();
  return Boolean(c.channelSecret && c.channelAccessToken);
}
