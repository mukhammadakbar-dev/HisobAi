module.exports = {
  apps: [
    {
      name: 'hisobai-api',
      script: 'dist/main.js',
      cwd: '/home/deploy/HisobAi/apps/api',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'hisobai-web',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000',
      cwd: '/home/deploy/HisobAi/apps/web',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
