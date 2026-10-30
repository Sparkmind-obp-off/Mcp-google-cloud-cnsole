module.exports = {
  apps: [{
    name: 'google-cloud-connector-preview',
    script: 'node',
    interpreter: 'none',
    args: 'node_modules/wrangler/bin/wrangler.js dev --config worker/wrangler.toml --env development --local --ip 0.0.0.0 --port 3000',
    cwd: '/home/user/webapp',
    watch: false,
    instances: 1,
    exec_mode: 'fork',
    env: { NODE_ENV: 'development' }
  }]
};
