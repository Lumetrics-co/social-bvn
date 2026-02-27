module.exports = {
  apps: [{
    name: 'captionforge',
    script: 'bun src/server.ts',
    cwd: '/Users/soumyasarkar/workspace/code/social-bvn',
    watch: false,
    instances: 1,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
