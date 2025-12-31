# Build Stage
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
# Install only dependencies
RUN pnpm install

# Copy source
COPY . .

# Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/index.js ./index.js
# If there are .env files needed, they should be mounted typically
# COPY --from=builder /app/.env ./.env 

ENV NODE_ENV=production

CMD ["node", "index.js"]
