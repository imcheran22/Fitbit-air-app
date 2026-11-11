FROM node:24-slim AS build
# Required at runtime: DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
# EMAIL_FROM, RESEND_API_KEY (production refuses to boot without the email ones),
# TOKEN_ENCRYPTION_KEY, GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET,
# GOOGLE_HEALTH_REDIRECT_URI, GOOGLE_HEALTH_WEBHOOK_SECRET, GOOGLE_CLOUD_PROJECT_NUMBER,
# GOOGLE_APPLICATION_CREDENTIALS (path to a mounted service account key file),
# GOOGLE_CLIENT_ID, APPLE_BUNDLE_ID, HANDLE_HOLD_SECRET (production refuses to boot without it).
# Rotating HANDLE_HOLD_SECRET releases every held buddy handle.
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# Carries both schema.prisma and migrations/, which `prisma migrate deploy`
# needs at startup. The prisma CLI itself is available in the production tree
# because @prisma/client depends on it. prisma.config.ts is deliberately NOT
# copied: Prisma's defaults already resolve prisma/schema.prisma and
# prisma/migrations, and the config file imports dotenv, which this package
# does not declare as a dependency.
COPY prisma ./prisma

EXPOSE 3000
USER node

HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://localhost:3000/health-check',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Migrate before serving: without this a fresh container starts against a
# schema-less database and every query fails.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
