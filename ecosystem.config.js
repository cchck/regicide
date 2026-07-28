// PM2 process definitions — keeps the website and the PvP server alive together,
// restarts them on crash, and (with `pm2 startup`) brings them back after a reboot.
//
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup        # follow the printed command once, for boot persistence
//
// If PM2 has trouble launching the tsx-based WS process on your host, use the CLI form:
//   pm2 start npm --name regicide-ws -- run ws
module.exports = {
  apps: [
    {
      name: 'regicide-web',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
    },
    {
      name: 'regicide-ws',
      script: './node_modules/.bin/tsx',
      args: 'server/index.ts',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
    },
  ],
};
