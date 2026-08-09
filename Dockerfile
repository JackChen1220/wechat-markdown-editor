FROM node:20-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    HEALTHCHECK_PATH=/api/health

WORKDIR /app

COPY --chown=node:node . .

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; const path = process.env.HEALTHCHECK_PATH || '/api/health'; fetch('http://127.0.0.1:' + port + path).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1));"

CMD ["node", "server.mjs"]
